import { test, expect, type Page } from "@playwright/test";
import { createCipheriv, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { x25519 } from "@noble/curves/ed25519.js";
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  hex,
  inputCommitment,
  resultCommitment,
  unbase64,
} from "../../shared/crypto";
import { readCsv } from "../../shared/inputs";
import {
  CHECKS,
  type AgentBuild,
  type Job,
  type PrivatePacket,
  type PrivateResult,
} from "../../shared/types";
import built from "../../deployments/builds.json" with { type: "json" };

// These responses are explicitly synthetic. Actual escrow execution is
// verified separately in the NEAR sandbox and the live testnet script.
function scenario(
  kind: "accepted" | "refund-pending" | "timeout" | "storage-failure",
  ai = false,
) {
  const secret = new Uint8Array(32).fill(17);
  const publicKey = hex(x25519.getPublicKey(secret));
  const jobs = new Map<string, Job>();
  let packet: PrivatePacket | undefined;
  let submitted: Record<string, unknown> | undefined;
  let executions = 0;
  const builds: AgentBuild[] = built.builds
    .filter((build) => build.feature !== "verifier")
    .map((build) => ({
      ...build,
      wasm_url: `/wasm/${build.hash}.wasm`,
      created_at: "0",
      accepted: ai && build.feature === "ledgerline-v1" ? 2 : 0,
      rejected: 0,
      timed_out: 0,
      execution_errors: 0,
      earned: "0",
    }));
  const verifier = built.builds.find((build) => build.feature === "verifier")!;
  const result: PrivateResult = {
    schema: "sealwork.invoice-reconciliation.v1",
    rows: [
      {
        invoice_id: "INV-1041",
        vendor: "Northstar Design",
        amount_minor: 125000,
        currency: "USD",
        status: "matched",
      },
      {
        invoice_id: "INV-1042",
        vendor: "Cloud Harbor",
        amount_minor: 8950,
        currency: "USD",
        status: "matched",
      },
      {
        invoice_id: "INV-1043",
        vendor: "Studio Moss",
        amount_minor: 64000,
        currency: "USD",
        status: "matched",
      },
      {
        invoice_id: "INV-1044",
        vendor: "Atlas Research",
        amount_minor: 32075,
        currency: "USD",
        status: "mismatch",
      },
      {
        invoice_id: "INV-1045",
        vendor: "Paper Plane",
        amount_minor: 17500,
        currency: "USD",
        status: "unpaid",
      },
      {
        invoice_id: "INV-1046",
        vendor: "Fern & Co",
        amount_minor: 4825,
        currency: "USD",
        status: "matched",
      },
    ],
  };
  if (kind === "refund-pending") result.rows[0].amount_minor += 1;
  async function attach(page: Page) {
    await page.route("**/api/config", (route) =>
      route.fulfill({
        json: {
          ready: true,
          network: "testnet",
          contract_id: built.contract_id,
          buyer_id: "buyer.sealwork-lab.testnet",
          project_id: built.project_id,
          encryption_public_key: publicKey,
          outlayer_api_url: "https://testnet-api.outlayer.ai",
          budget: "50000000000000000000000",
          storage_deposit: "163840000000000000000000",
          compute_deposit: "20000000000000000000000",
          total_deposit: "233840000000000000000000",
          verifier_hash: verifier.hash,
          builds,
          jobs: [...jobs.values()],
          timestamp: new Date().toISOString(),
          demo_remaining: 12,
          create_challenge: "synthetic-browser-test-challenge",
          planner: { ready: ai, model: "synthetic-test-model", prompt_hash: "1".repeat(64), policy_hash: "2".repeat(64) },
        },
      }),
    );
    await page.route("**/api/plan", async route => {
      const request = route.request().postDataJSON() as Record<string, unknown>;
      expect(Object.keys(request).sort()).toEqual(["challenge", "job_id", "priority"]);
      expect(JSON.stringify(request)).not.toContain("Northstar Design");
      expect(jobs.size).toBe(0);
      await route.fulfill({ json: { plan: { job_id: request.job_id, build_hash: builds[0].hash,
        rationale: "This exact version has accepted deliveries and stays within the agreed budget and checks.",
        priority: "proven", budget: "50000000000000000000000", expires_at: Date.now() + 600_000,
        model: "synthetic-test-model", model_response_id: "synthetic-response-id", prompt_hash: "1".repeat(64),
        policy_hash: "2".repeat(64), response_hash: "3".repeat(64), permit: "synthetic-test-permit" } } });
    });
    await page.route("**/api/jobs*", async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        const id = new URL(request.url()).searchParams.get("id");
        await route.fulfill({
          json: id ? { job: jobs.get(id) } : { jobs: [...jobs.values()] },
        });
        return;
      }
      submitted = request.postDataJSON() as Record<string, unknown>;
      if (ai) expect(submitted.hiring_permit).toBe("synthetic-test-permit");
      const encoded = unbase64(submitted.encrypted_input as string);
      const shared = x25519.getSharedSecret(secret, encoded.slice(1, 33));
      const key = hkdf(
        sha256,
        shared,
        undefined,
        new TextEncoder().encode("outlayer-keystore-v1"),
        32,
      );
      const decoded = chacha20poly1305(key, encoded.slice(33, 45)).decrypt(
        encoded.slice(45),
      );
      const outer = JSON.parse(new TextDecoder().decode(decoded)) as {
        SEALWORK_INPUT: string;
      };
      packet = JSON.parse(outer.SEALWORK_INPUT) as PrivatePacket;
      expect(inputCommitment(packet.input)).toBe(submitted.input_commitment);
      const build = builds.find(
        (build) => build.hash === submitted!.build_hash,
      )!;
      const id = submitted.job_id as string;
      const now = BigInt(Date.now()) * 1_000_000n;
      const job: Job = {
        id,
        title: submitted.title as string,
        buyer_id: "buyer.sealwork-lab.testnet",
        provider_id: build.provider_id,
        build_hash: build.hash,
        manifest_hash: build.manifest_hash,
        verifier_hash: verifier.hash,
        input_commitment: packet.input_commitment,
        profile: id,
        budget: "50000000000000000000000",
        compute_remaining: "20000000000000000000000",
        storage_deposit: "163840000000000000000000",
        compute_refund_amount: "0",
        compute_refund_state: "none",
        state: "funded",
        outcome: null,
        settlement: "pending",
        settlement_amount: "0",
        settlement_recipient: "",
        created_at: now.toString(),
        deadline: (
          now +
          (kind === "timeout" || kind === "storage-failure"
            ? 500_000_000n
            : 180_000_000_000n)
        ).toString(),
        settled_at: null,
        agent_request_id: null,
        verifier_request_id: null,
        agent_transaction_hash: null,
        verifier_transaction_hash: null,
        result_commitment: null,
        result_ciphertext: null,
        checks: [],
        reason: null,
      };
      jobs.set(id, job);
      if (kind === "storage-failure")
        await route.fulfill({
          status: 502,
          json: {
            error:
              "The job is funded, but private input storage could not complete. Its budget can be refunded after the deadline.",
            job_id: id,
            capability: `synthetic-${id}`,
          },
        });
      else
        await route.fulfill({
          status: 201,
          json: {
            job,
            capability: `synthetic-${id}`,
            transaction_hash: "synthetic-funding-transaction",
          },
        });
    });
    await page.route("**/api/control", async (route) => {
      const body = route.request().postDataJSON() as {
        job_id: string;
        action: string;
        capability: string;
      };
      const job = jobs.get(body.job_id)!;
      if (body.action === "execute") {
        executions += 1;
        expect(body.capability).toBe(`synthetic-${job.id}`);
        expect(executions).toBe(1);
        const plaintext = JSON.stringify(result);
        const nonce = randomBytes(12);
        const cipher = createCipheriv(
          "aes-256-gcm",
          Buffer.from(packet!.input.buyer_key, "hex"),
          nonce,
        );
        cipher.setAAD(
          Buffer.from(`sealwork:delivery:v1:${job.id}:${job.input_commitment}`),
        );
        const bytes = Buffer.concat([
          cipher.update(plaintext),
          cipher.final(),
          cipher.getAuthTag(),
        ]);
        job.result_ciphertext = Buffer.concat([
          Buffer.from([1]),
          nonce,
          bytes,
        ]).toString("base64");
        job.result_commitment = resultCommitment(plaintext, packet!.input.salt);
        job.agent_request_id = "101";
        job.verifier_request_id = "102";
        job.state = "settled";
        job.outcome = kind === "refund-pending" ? "rejected" : "accepted";
        job.settlement = kind === "refund-pending" ? "pending" : "paid";
        job.checks = CHECKS.map((check) => ({
          id: check.id,
          passed: kind !== "refund-pending" || check.id !== "amounts_preserved",
        }));
        job.settlement_recipient =
          job.outcome === "accepted" ? job.provider_id : job.buyer_id;
        job.settlement_amount = job.budget;
      } else if (body.action === "expire") {
        job.state = "settled";
        job.outcome = "timed_out";
        job.settlement = "refunded";
        job.settlement_recipient = job.buyer_id;
        job.settlement_amount = (
          BigInt(job.budget) + BigInt(job.compute_remaining)
        ).toString();
        job.compute_remaining = "0";
      } else if (body.action === "claim") job.settlement = "refunded";
      job.settled_at = (BigInt(Date.now()) * 1_000_000n).toString();
      await route.fulfill({
        json: { job, transaction_hash: "synthetic-control-transaction" },
      });
    });
    await page.route("**/api/attestation*", (route) =>
      route.fulfill({
        json: {
          request_id: "101",
          available: true,
          wasm_hash: jobs.values().next().value?.build_hash,
          wasm_matches: true,
          quote_present: true,
          url: "https://app.outlayer.ai/attestation/1?network=testnet",
        },
      }),
    );
  }
  return {
    attach,
    jobs,
    get packet() {
      return packet;
    },
    get submitted() {
      return submitted;
    },
    get executions() {
      return executions;
    },
  };
}
async function create(
  page: Page,
  fixture: ReturnType<typeof scenario>,
  timeout = false,
) {
  await fixture.attach(page);
  await page.goto("/new");
  if (timeout)
    await page
      .getByRole("checkbox", { name: /Test a missed deadline/ })
      .check();
  await page.getByRole("checkbox", { name: /I agree to these checks/ }).check();
  await page.getByRole("button", { name: "Encrypt & fund the job" }).click();
  await expect(page).toHaveURL(/\/jobs\/sw_[a-f0-9]{32}/);
}

test("browser encryption, accepted delivery, exact CSV export, public receipt, and private recovery work together", async ({
  page,
  context,
}) => {
  const fixture = scenario("accepted");
  await create(page, fixture);
  await expect(
    page.getByText("Northstar Design", { exact: true }),
  ).toBeVisible();
  expect(fixture.executions).toBe(1);
  const sent = JSON.stringify(fixture.submitted);
  expect(sent).not.toContain("Northstar Design");
  expect(sent).not.toContain(fixture.packet!.input.buyer_key);
  expect(sent).not.toContain("source_csv");
  await expect(page.locator(".job-detail-heading .pill")).toHaveText(
    "Verified & paid",
  );
  let pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  let download = await pending;
  const rows = readCsv(await readFile((await download.path())!, "utf8"));
  expect(rows).toHaveLength(7);
  expect(rows[1]).toEqual([
    "INV-1041",
    "Northstar Design",
    "1250.00",
    "USD",
    "matched",
  ]);
  pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export receipt" }).click();
  download = await pending;
  const receipt = await readFile((await download.path())!, "utf8");
  expect(receipt).not.toContain("Northstar Design");
  expect(receipt).not.toContain(fixture.packet!.input.buyer_key);
  pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save recovery file" }).click();
  download = await pending;
  const recovery = (await download.path())!;
  const other = await context.newPage();
  await fixture.attach(other);
  await other.goto(new URL(page.url()).pathname);
  await expect(
    other.getByText("This delivery is encrypted.", { exact: true }),
  ).toBeVisible();
  await expect(
    other.getByText("Northstar Design", { exact: true }),
  ).toHaveCount(0);
  await other
    .getByLabel("Import private delivery recovery file")
    .setInputFiles(recovery);
  await expect(
    other.getByText("Northstar Design", { exact: true }),
  ).toBeVisible();
  await other.close();
  await page
    .getByRole("button", { name: "Inspect attestation" })
    .first()
    .click();
  await expect(
    page.getByText("Binary fingerprint matches", { exact: true }),
  ).toBeVisible();
});

test("rejected work shows a pending refund honestly and exposes a failed transfer retry", async ({
  page,
}) => {
  const fixture = scenario("refund-pending");
  await create(page, fixture);
  await expect(page.locator(".job-detail-heading .pill")).toHaveText(
    "Rejected · refund pending",
  );
  await expect(page.locator(".rejection-explanation")).toContainText(
    "refund transfer is pending",
  );
  const job = [...fixture.jobs.values()][0];
  job.settlement = "claimable";
  await page.reload();
  await expect(page.locator(".job-detail-heading .pill")).toHaveText(
    "Rejected · transfer needs retry",
  );
  await page
    .getByRole("button", {
        name: /Retry.*transfer|Retry.*settlement|Retry.*payment|Retry.*payout/i,
    })
    .click();
  await expect(page.locator(".job-detail-heading .pill")).toHaveText(
    "Rejected · refunded",
  );
});

test("a missed deadline skips agent execution and refunds the reserved budget and compute", async ({
  page,
}) => {
  const fixture = scenario("timeout");
  await create(page, fixture, true);
  const refund = page.getByRole("button", { name: /Request.*refund/i });
  await expect(refund).toBeEnabled({ timeout: 5000 });
  await refund.click();
  await expect(page.locator(".job-detail-heading .pill")).toHaveText(
    "Expired · refunded",
  );
  expect(fixture.executions).toBe(0);
  expect([...fixture.jobs.values()][0].settlement_amount).toBe(
    "70000000000000000000000",
  );
});

test("a partial funding error retains the private key and routes to the recoverable funded job", async ({
  page,
}) => {
  const fixture = scenario("storage-failure");
  await create(page, fixture);
  await expect(page.locator(".form-error")).toContainText(
    "private input storage could not complete",
  );
  expect(fixture.executions).toBe(0);
  const id = [...fixture.jobs.keys()][0];
  expect(
    await page.evaluate(
      (id) => Boolean(sessionStorage.getItem(`sealwork:private:${id}`)),
      id,
    ),
  ).toBe(true);
});

test("AI hiring shares constraints only and waits for consent before funding the chosen worker", async ({ page }) => {
  const fixture = scenario("accepted", true);
  await fixture.attach(page);
  await page.goto("/new?mode=agent");
  const hire = page.getByRole("button", { name: "Approve rules & let the agent hire" });
  await expect(hire).toBeDisabled();
  await page.getByRole("button", { name: "Choose a worker within my rules" }).click();
  await expect(page.locator(".hiring-recommendation")).toContainText("Policy checked");
  expect(fixture.jobs.size).toBe(0);
  await expect(hire).toBeDisabled();
  await page.getByRole("checkbox", { name: /I agree to these checks/ }).check();
  await hire.click();
  await expect(page).toHaveURL(/\/jobs\/sw_[a-f0-9]{32}/);
  await expect(page.locator(".job-detail-heading .pill")).toHaveText("Verified & paid");
  await expect(page.locator(".hiring-receipt")).toContainText("received no financial files or payment keys");
  expect(fixture.executions).toBe(1);
});
