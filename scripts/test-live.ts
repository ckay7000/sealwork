import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import deployment from "../deployments/testnet.json" with { type: "json" };
import built from "../deployments/builds.json" with { type: "json" };
import {
  inputCommitment,
  openResult,
  randomHex,
  resultCommitment,
  sealToKeystore,
} from "../shared/crypto";
import {
  CHECKS,
  LEDGER_SAMPLE,
  SOURCE_SAMPLE,
  type Job,
  type PrivateInput,
  type PublicConfig,
  type AttestationSummary,
} from "../shared/types";

// Uses public sample inputs and only the site's capped, dedicated testnet
// sponsor. Signing keys and private delivery keys never enter the report.
const site = new URL(process.env.SEALWORK_TEST_URL || process.env.SEALWORK_SITE_URL || "http://127.0.0.1:5190");
if (!deployment.contract_id.endsWith(".testnet") || deployment.network !== "testnet")
  throw new Error("Live checks require the dedicated NEAR testnet deployment.");
if (!["http:", "https:"].includes(site.protocol))
  throw new Error("Choose an HTTP or HTTPS Sealwork site.");

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function request<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(new URL(path, site), {
    method: data === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(240_000),
  });
  const value = await response.json() as Record<string, unknown>;
  if (!response.ok)
    throw new Error(typeof value.error === "string" ? value.error : `Sealwork returned HTTP ${response.status}.`);
  return value as T;
}
async function poll(id: string, done: (job: Job) => boolean): Promise<Job> {
  const end = Date.now() + 210_000;
  while (Date.now() < end) {
    const { job } = await request<{ job: Job }>(`/api/jobs?id=${id}`);
    if (done(job)) return job;
    await delay(2000);
  }
  throw new Error(`The testnet job ${id} did not finish within its deadline. Inspect its public receipt.`);
}
async function proof(id: string, phase: "agent" | "verifier"): Promise<AttestationSummary> {
  const end = Date.now() + 60_000;
  while (Date.now() < end) {
    const evidence = await request<AttestationSummary>(`/api/attestation?job_id=${id}&phase=${phase}`);
    if (evidence.available) {
      assert.ok(evidence.wasm_matches, "The real attestation must match the exact executing binary.");
      assert.ok(evidence.quote_present, "The real execution must publish its hardware quote.");
      assert.match(evidence.request_id, /^[0-9]{1,20}$/);
      return evidence;
    }
    await delay(2000);
  }
  throw new Error(`Execution evidence for ${id}/${phase} did not become available.`);
}

const good = built.builds.find((build) => build.feature === "ledgerline-v1")!;
const update = built.builds.find((build) => build.feature === "ledgerline-v2")!;
const outcomes: Array<Record<string, unknown>> = [];
const initial = await request<PublicConfig>("/api/config");
assert.equal(initial.contract_id, deployment.contract_id, "The tested site must use this deployment.");
assert.equal(initial.verifier_hash, deployment.verifier_hash, "The verifier must match the published binary.");
assert.ok(initial.ready && initial.demo_remaining >= 3, "Three sponsored testnet jobs must be available.");
assert.notEqual(good.hash, update.hash);
const previous = new Map(initial.builds.map((build) => [build.hash, build]));

for (const kind of ["accepted", "rejected", "timed_out"] as const) {
  const config = await request<PublicConfig>("/api/config");
  assert.ok(config.ready && config.create_challenge, "The testnet sponsor must be ready.");
  const input: PrivateInput = {
    job_id: `sw_${randomHex(16)}`,
    source_csv: SOURCE_SAMPLE,
    ledger_csv: LEDGER_SAMPLE,
    buyer_key: randomHex(),
    salt: randomHex(),
  };
  const commitment = inputCommitment(input);
  const encrypted = sealToKeystore(JSON.stringify({
    SEALWORK_INPUT: JSON.stringify({ input, input_commitment: commitment }),
  }), config.encryption_public_key);
  const build = kind === "rejected" ? update : good;
  console.log(`Starting ${kind} testnet case: ${input.job_id}`);
  const created = await request<{ job: Job; capability: string; transaction_hash: string }>("/api/jobs", {
    job_id: input.job_id,
    title: `Live check: ${kind === "accepted" ? "verified delivery" : kind === "rejected" ? "faulty update rejected" : "missed deadline refund"}`,
    build_hash: build.hash,
    input_commitment: commitment,
    encrypted_input: encrypted,
    challenge: config.create_challenge,
    scenario: kind === "timed_out" ? "timeout" : "normal",
  });
  assert.equal(created.job.build_hash, build.hash);
  assert.equal(created.job.input_commitment, commitment);
  if (kind === "timed_out") {
    const deadline = Number(BigInt(created.job.deadline) / 1_000_000n);
    await delay(Math.max(0, deadline - Date.now() + 1000));
    await request("/api/control", { job_id: input.job_id, action: "expire" });
  } else {
    await request("/api/control", {
      job_id: input.job_id,
      action: "execute",
      capability: created.capability,
    });
  }
  const job = await poll(input.job_id, (value) => value.state === "settled" && ["paid", "refunded", "claimable"].includes(value.settlement));
  const executionProofs: Array<{ phase: string; request_id: string; wasm_hash?: string; quote_present?: boolean; url: string }> = [];
  assert.equal(job.outcome, kind, `Unexpected outcome on ${job.id}.`);
  assert.equal(job.settlement, kind === "accepted" ? "paid" : "refunded");
  assert.equal(job.settlement_recipient, kind === "accepted" ? job.provider_id : job.buyer_id);
  if (kind === "timed_out") {
    assert.equal(job.agent_request_id, null);
    assert.equal(job.verifier_request_id, null);
    assert.equal(BigInt(job.settlement_amount), BigInt(created.job.budget) + BigInt(created.job.compute_remaining));
  } else {
    assert.equal(job.verifier_hash, deployment.verifier_hash);
    assert.ok(job.agent_request_id || job.agent_transaction_hash);
    assert.ok(job.verifier_request_id || job.verifier_transaction_hash);
    assert.equal(job.checks.length, CHECKS.length);
    assert.equal(new Set(job.checks.map((check) => check.id)).size, CHECKS.length);
    assert.ok(CHECKS.every((check) => job.checks.some((result) => result.id === check.id)));
    assert.equal(job.checks.every((check) => check.passed), kind === "accepted");
    assert.ok(job.result_ciphertext && job.result_commitment);
    const opened = await openResult(job.result_ciphertext, input.buyer_key, job.id, commitment);
    assert.equal(resultCommitment(opened.bytes, input.salt), job.result_commitment);
    assert.equal(opened.result.rows.length, 6);
    assert.equal(opened.result.rows[0].amount_minor, kind === "accepted" ? 125000 : 125001);
    const publicReceipt = JSON.stringify(job);
    assert.ok(!publicReceipt.includes(input.buyer_key) && !publicReceipt.includes("Northstar Design"));
    for (const phase of ["agent", "verifier"] as const) {
      const evidence = await proof(job.id, phase);
      executionProofs.push({ phase, request_id: evidence.request_id, wasm_hash: evidence.wasm_hash, quote_present: evidence.quote_present, url: evidence.url });
    }
  }
  outcomes.push({
    job_id: job.id,
    build_hash: job.build_hash,
    verifier_hash: job.verifier_hash,
    outcome: job.outcome,
    settlement: job.settlement,
    settlement_amount: job.settlement_amount,
    settlement_recipient: job.settlement_recipient,
    agent_request_id: job.agent_request_id,
    verifier_request_id: job.verifier_request_id,
    agent_transaction_hash: job.agent_transaction_hash,
    verifier_transaction_hash: job.verifier_transaction_hash,
    checks: job.checks,
    execution_proofs: executionProofs,
    transaction_hash: created.transaction_hash,
    receipt_url: new URL(`/jobs/${job.id}`, site).href,
  });
  console.log(`Confirmed ${job.outcome}: ${job.settlement}`);
}
const final = await request<PublicConfig>("/api/config");
const after = new Map(final.builds.map((build) => [build.hash, build]));
for (const [hash, field] of [[good.hash, "accepted"], [good.hash, "timed_out"], [update.hash, "rejected"]] as const)
  assert.equal(after.get(hash)![field], previous.get(hash)![field] + 1, "Outcomes must belong to the exact hired build.");
assert.equal(after.get(good.hash)!.rejected, previous.get(good.hash)!.rejected);
const report = { success: true, network: "testnet", site_url: site.origin, contract_id: deployment.contract_id, checked_at: new Date().toISOString(), outcomes };
await mkdir("reports", { recursive: true });
await writeFile("reports/live.json", JSON.stringify(report, null, 2) + "\n");
console.log("All three real testnet outcomes passed. Public evidence saved to reports/live.json.");
