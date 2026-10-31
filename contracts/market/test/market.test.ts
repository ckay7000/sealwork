import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Worker, type NearAccount } from "near-workspaces";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARKET = fileURLToPath(new URL("../build/market.wasm", import.meta.url));
const MOCK = fileURLToPath(
  new URL("../build/mock-outlayer.wasm", import.meta.url),
);
const GAS = "300000000000000";
const N = 10n ** 24n;
const BUDGET = N / 20n;
const COMPUTE = N / 50n;
const GOOD = "a".repeat(64);
const UPDATE = "b".repeat(64);
const MANIFEST = "c".repeat(64);
describe("Sealwork escrow, authenticated outcomes, and exact-build reputation", () => {
  let worker: Worker;
  let root: NearAccount;
  let seq = 0;
  let jobs = 0;
  let sandboxDirectory = "";
  beforeAll(async () => {
    await mkdir(".local/sandboxes", { recursive: true });
    sandboxDirectory = await mkdtemp(path.resolve(".local/sandboxes/run-"));
    worker = await Worker.init({
      network: "sandbox",
      homeDir: path.join(sandboxDirectory, "node"),
      rm: false,
    });
    root = worker.rootAccount;
    expect(worker.provider.connection.url.startsWith("http://127.0.0.1:")).toBe(
      true,
    );
  });
  afterAll(async () => {
    if (worker) await worker.tearDown();
    if (sandboxDirectory)
      await rm(sandboxDirectory, { recursive: true, force: true });
  });
  const call = (
    signer: NearAccount,
    contract: NearAccount,
    name: string,
    args: object = {},
    deposit = "0",
  ) =>
    signer.call<any>(contract, name, args, {
      gas: GAS,
      attachedDeposit: deposit,
    });
  const get = (contract: NearAccount, id: string) =>
    contract.view<any>("get_job", { job_id: id });
  const build = (contract: NearAccount, hash: string) =>
    contract.view<any>("get_build", { hash });
  async function fixture(limit = 30) {
    const market = await root.devDeploy(MARKET);
    const outlayer = await root.devDeploy(MOCK);
    const prefix = `sw-${++seq}`;
    const buyer = await root.createSubAccount(`${prefix}-buyer`);
    const provider = await root.createSubAccount(`${prefix}-provider`);
    const outsider = await root.createSubAccount(`${prefix}-outsider`);
    await call(market, market, "init", {
      owner_id: root.accountId,
      outlayer_contract_id: outlayer.accountId,
      project_id: `${root.accountId}/sealwork`,
      verifier_hash: "d".repeat(64),
      verifier_manifest_hash: "e".repeat(64),
      demo_buyer_id: buyer.accountId,
      demo_daily_limit: limit,
    });
    const config = await market.view<any>("get_config");
    for (const hash of [GOOD, UPDATE])
      await call(
        root,
        market,
        "register_build",
        {
          hash,
          manifest_hash: MANIFEST,
          agent_id: "ledgerline",
          name: "Ledgerline",
          version: hash === GOOD ? "1.0" : "1.1",
          provider_id: provider.accountId,
          wasm_url: `https://example.test/wasm/${hash}.wasm`,
          description: "Isolated contract verification fixture.",
        },
        config.build_storage_deposit,
      );
    return {
      market,
      outlayer,
      buyer,
      provider,
      outsider,
      config,
      providerPrefix: `${prefix}-provider`,
    };
  }
  async function fund(
    f: Awaited<ReturnType<typeof fixture>>,
    hash = GOOD,
    deadline = 180,
  ) {
    const id = `sw_${(++jobs).toString(16).padStart(32, "0")}`;
    await call(
      f.buyer,
      f.market,
      "create_job",
      {
        job_id: id,
        title: "Private invoice reconciliation",
        build_hash: hash,
        input_commitment: "1".repeat(64),
        budget: BUDGET.toString(),
        compute_deposit: COMPUTE.toString(),
        deadline_seconds: deadline,
      },
      (BUDGET + COMPUTE + BigInt(f.config.job_storage_deposit)).toString(),
    );
    return id;
  }
  it("pays exactly the agreed budget after all six authenticated checks pass", async () => {
    const f = await fixture();
    const id = await fund(f);
    const before = BigInt((await f.provider.accountView()).amount);
    await call(f.buyer, f.market, "execute_job", { job_id: id });
    const job = await get(f.market, id);
    const after = BigInt((await f.provider.accountView()).amount);
    expect(job.outcome).toBe("accepted");
    expect(job.settlement).toBe("paid");
    expect(job.checks).toHaveLength(6);
    expect(job.checks.every((c: any) => c.passed)).toBe(true);
    expect(after - before).toBe(BUDGET);
    expect((await build(f.market, GOOD)).earned).toBe(BUDGET.toString());
    expect((await build(f.market, UPDATE)).accepted).toBe(0);
  });
  it("pays with a runtime transaction reference when OutLayer omits the SDK request ID", async () => {
    const f = await fixture();
    const id = await fund(f);
    await call(root, f.outlayer, "set_mode", { mode: "transaction_context" });
    await call(f.buyer, f.market, "execute_job", { job_id: id });
    const job = await get(f.market, id);
    expect(job.outcome).toBe("accepted");
    expect(job.settlement).toBe("paid");
    expect(job.agent_request_id).toBeNull();
    expect(job.verifier_request_id).toBeNull();
    expect(job.agent_transaction_hash).toBe("HKPL27raNxkJwYNZs6uX8xcPEai5S7aqTfD47wG9xQfF");
    expect(job.verifier_transaction_hash).toBe(job.agent_transaction_hash);
  });
  it("keeps the full allowed encrypted delivery within its funded storage", async () => {
    const f = await fixture();
    const id = await fund(f);
    const before = await f.market.accountView();
    await call(root, f.outlayer, "set_mode", { mode: "large_delivery" });
    const execution = await f.buyer.callRaw(
      f.market,
      "execute_job",
      { job_id: id },
      { gas: GAS },
    );
    expect(
      execution.receiptFailures,
      execution.receiptFailureMessages.join("\n"),
    ).toEqual([]);
    const job = await get(f.market, id);
    const after = await f.market.accountView();
    expect(job.outcome).toBe("accepted");
    expect(job.settlement).toBe("paid");
    expect(job.result_ciphertext.length).toBe(12000);
    expect(
      BigInt(after.storage_usage) - BigInt(before.storage_usage),
    ).toBeLessThan(15000n);
  });
  it("refunds rejected work and records failure only against the hired update", async () => {
    const f = await fixture();
    const id = await fund(f, UPDATE);
    await call(root, f.outlayer, "set_mode", { mode: "rejected" });
    await call(f.buyer, f.market, "execute_job", { job_id: id });
    const job = await get(f.market, id);
    expect(job.outcome).toBe("rejected");
    expect(job.settlement).toBe("refunded");
    expect(job.settlement_recipient).toBe(f.buyer.accountId);
    expect((await build(f.market, UPDATE)).rejected).toBe(1);
    expect((await build(f.market, GOOD)).rejected).toBe(0);
    expect((await build(f.market, UPDATE)).earned).toBe("0");
  });
  it.each([
    "wrong_input",
    "wrong_manifest",
    "duplicate_checks",
    "lying_verdict",
    "null_output",
    "missing_context",
    "invalid_request_id",
    "invalid_transaction_hash",
  ])("fails closed on %s without paying the provider", async (mode) => {
    const f = await fixture();
    const id = await fund(f);
    await call(root, f.outlayer, "set_mode", { mode });
    await call(f.buyer, f.market, "execute_job", { job_id: id });
    const job = await get(f.market, id);
    expect(job.outcome).toBe("execution_error");
    expect(job.settlement).toBe("refunded");
    expect((await build(f.market, GOOD)).accepted).toBe(0);
  });
  it.each([
    ["agent_admission_failed", BUDGET + COMPUTE],
    ["verifier_admission_failed", BUDGET + COMPUTE / 2n],
  ])("returns unspent compute after %s", async (mode, expected) => {
    const f = await fixture();
    const id = await fund(f);
    await call(root, f.outlayer, "set_mode", { mode });
    await call(f.buyer, f.market, "execute_job", { job_id: id });
    const job = await get(f.market, id);
    expect(job.outcome).toBe("execution_error");
    expect(job.settlement).toBe("refunded");
    expect(job.settlement_amount).toBe(expected.toString());
  });
  it("allows anyone to refund an expired job once, without replacing its outcome", async () => {
    const f = await fixture();
    const id = await fund(f, GOOD, 5);
    await expect(
      call(f.outsider, f.market, "expire_job", { job_id: id }),
    ).rejects.toThrow(/deadline/i);
    await worker.provider.fastForward(20);
    await call(f.outsider, f.market, "expire_job", { job_id: id });
    const job = await get(f.market, id);
    expect(job.outcome).toBe("timed_out");
    expect(job.settlement_amount).toBe((BUDGET + COMPUTE).toString());
    await expect(
      call(f.buyer, f.market, "execute_job", { job_id: id }),
    ).rejects.toThrow(/already/i);
    await expect(
      call(f.outsider, f.market, "expire_job", { job_id: id }),
    ).rejects.toThrow(/permanent/i);
    expect((await build(f.market, GOOD)).timed_out).toBe(1);
  });
  it("rejects forged callbacks, unauthorized execution, and build replacement", async () => {
    const f = await fixture();
    const id = await fund(f);
    for (const name of [
      "on_agent_result",
      "on_verifier_result",
      "on_settlement",
      "on_compute_refund",
    ])
      await expect(
        call(f.outsider, f.market, name, { job_id: id }),
      ).rejects.toThrow(/private|contract/i);
    await expect(
      call(f.outsider, f.market, "execute_job", { job_id: id }),
    ).rejects.toThrow(/buyer|provider/i);
    await expect(
      call(
        root,
        f.market,
        "register_build",
        {
          hash: GOOD,
          manifest_hash: MANIFEST,
          agent_id: "ledgerline",
          name: "Changed",
          version: "2",
          provider_id: f.provider.accountId,
          wasm_url: "https://example.test/new.wasm",
          description: "Replacement",
        },
        f.config.build_storage_deposit,
      ),
    ).rejects.toThrow(/immutable/i);
    expect((await get(f.market, id)).state).toBe("funded");
  });
  it("keeps a failed payout claimable and pays the original recipient exactly once on retry", async () => {
    const f = await fixture();
    const id = await fund(f);
    await f.provider.delete(root.accountId);
    await call(f.buyer, f.market, "execute_job", { job_id: id });
    let job = await get(f.market, id);
    expect(job.outcome).toBe("accepted");
    expect(job.settlement).toBe("claimable");
    expect((await build(f.market, GOOD)).earned).toBe("0");
    const restored = await root.createSubAccount(f.providerPrefix);
    const before = BigInt((await restored.accountView()).amount);
    await call(f.outsider, f.market, "claim_settlement", { job_id: id });
    job = await get(f.market, id);
    expect(job.settlement).toBe("paid");
    expect(BigInt((await restored.accountView()).amount) - before).toBe(BUDGET);
    await expect(
      call(f.outsider, f.market, "claim_settlement", { job_id: id }),
    ).rejects.toThrow(/No failed/i);
    expect((await build(f.market, GOOD)).accepted).toBe(1);
    expect((await build(f.market, GOOD)).earned).toBe(BUDGET.toString());
  });
  it("enforces exact funding, unique jobs, and the sponsored allowance before storing new jobs", async () => {
    const f = await fixture(1);
    const id = await fund(f);
    await expect(fund(f)).rejects.toThrow(/allowance/i);
    await expect(
      call(
        f.buyer,
        f.market,
        "create_job",
        {
          job_id: id,
          title: "Replayed job",
          build_hash: GOOD,
          input_commitment: "1".repeat(64),
          budget: BUDGET.toString(),
          compute_deposit: COMPUTE.toString(),
        },
        "0",
      ),
    ).rejects.toThrow(/already exists/i);
    expect((await f.market.view<any>("get_config")).job_count).toBe(1);
  });
});
