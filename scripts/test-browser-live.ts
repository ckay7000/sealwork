import assert from "node:assert/strict";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import deployment from "../deployments/testnet.json" with { type: "json" };
import built from "../deployments/builds.json" with { type: "json" };
import type { Job, PublicConfig } from "../shared/types";

// One explicitly invoked sponsored testnet job through the real hosted UI.
// Recovery material stays in ignored .local; reports contain public evidence.
const site = new URL(process.env.SEALWORK_TEST_URL || process.env.SEALWORK_SITE_URL || "");
assert.equal(deployment.network, "testnet");
assert.ok(deployment.contract_id.endsWith(".testnet"));
assert.equal(site.origin, new URL(deployment.site_url).origin);
const response = await fetch(new URL("/api/config", site), { signal: AbortSignal.timeout(30_000) });
assert.ok(response.ok);
const config = await response.json() as PublicConfig;
assert.equal(config.contract_id, deployment.contract_id);
assert.ok(config.ready && config.demo_remaining >= 1);
const good = built.builds.find(build => build.feature === "ledgerline-v1")!;
const browser = await chromium.launch({
  headless: true, executablePath: process.env.SEALWORK_CHROMIUM_PATH,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(new URL(`/new?build=${good.hash}`, site).href);
  await page.getByRole("checkbox", { name: /I agree to these checks/ }).check();
  await expect(page.getByRole("button", { name: "Encrypt & fund the job" })).toBeEnabled();
  await page.getByRole("button", { name: "Encrypt & fund the job" }).click();
  await expect(page).toHaveURL(/\/jobs\/sw_[a-f0-9]{32}/, { timeout: 180_000 });
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  console.log("Checking the real hosted browser job:", id);
  await expect(page.locator(".job-detail-heading .pill")).toHaveText("Verified & paid", { timeout: 180_000 });
  await expect(page.getByText("Northstar Design", { exact: true })).toBeVisible();

  let pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  let download = await pending;
  const csv = await readFile((await download.path())!, "utf8");
  assert.ok(csv.includes('"INV-1041","Northstar Design",1250.00,"USD","matched"'));

  pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export receipt" }).click();
  download = await pending;
  const receiptText = await readFile((await download.path())!, "utf8");
  const receipt = JSON.parse(receiptText) as { contract_id: string; job: Job };
  assert.equal(receipt.contract_id, deployment.contract_id);
  assert.equal(receipt.job.id, id);
  assert.equal(receipt.job.build_hash, good.hash);
  assert.equal(receipt.job.outcome, "accepted");
  assert.equal(receipt.job.settlement, "paid");
  const privateKey = await page.evaluate(jobId => {
    const value = JSON.parse(sessionStorage.getItem(`sealwork:private:${jobId}`) || "null");
    return value?.buyer_key as string;
  }, id);
  assert.ok(privateKey && !receiptText.includes(privateKey) && !receiptText.includes("Northstar Design"));

  pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save recovery file" }).click();
  download = await pending;
  await mkdir(".local", { recursive: true, mode: 0o700 });
  const recovery = ".local/browser-live-recovery.json";
  await download.saveAs(recovery);
  await chmod(recovery, 0o600);
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.getByText("This delivery is encrypted.", { exact: true })).toBeVisible();
  await expect(other.getByText("Northstar Design", { exact: true })).toHaveCount(0);
  await other.getByLabel("Import private delivery recovery file").setInputFiles(recovery);
  await expect(other.getByText("Northstar Design", { exact: true })).toBeVisible();
  await other.close();

  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Inspect attestation" }).nth(i).click();
    await expect(page.getByText("Binary fingerprint matches", { exact: true })).toHaveCount(i + 1);
    await expect(page.getByText("Hardware quote present", { exact: true })).toHaveCount(i + 1);
  }
  await mkdir("reports/screenshots", { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: `reports/screenshots/live-job-${width}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  await writeFile("reports/browser-live.json", JSON.stringify({
    success: true, checked_at: new Date().toISOString(), site_url: site.origin,
    contract_id: deployment.contract_id, job_id: id, receipt_url: new URL(`/jobs/${id}`, site).href,
    outcome: "accepted", settlement: "paid", csv_exported: true,
    public_receipt_excludes_plaintext_and_delivery_key: true,
    recovery_opens_delivery_in_new_page: true, matching_attestations: 2,
    desktop_and_mobile_without_overflow: true, page_errors: errors,
  }, null, 2) + "\n");
  console.log("Hosted browser payment, private delivery, CSV, recovery, and both proof inspections passed.");
} finally {
  await browser.close();
}
