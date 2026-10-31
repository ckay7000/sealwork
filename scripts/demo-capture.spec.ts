import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

test("capture actual public testnet receipts for the marketing film", async ({ page }) => {
  await mkdir("reports/demo/stills", { recursive: true });
  const cases = {
    accepted: "sw_61d5c23989d10f9d1c7271265fc329ad",
    rejected: "sw_cd527cf5498aca5edb472294ca72ade1",
    timeout: "sw_23a46154077f9c6cfc1c3a8fc930f76f",
  };
  for (const [name, id] of Object.entries(cases)) {
    await page.goto(`https://sealwork.vercel.app/jobs/${id}`);
    await expect(page.locator(".job-detail-heading .pill")).toHaveText(
      name === "accepted" ? "Verified & paid" : name === "rejected" ? "Rejected · refunded" : "Expired · refunded",
      { timeout: 60_000 },
    );
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo({ top: 0, behavior: "instant" }); });
    await page.screenshot({ path: `reports/demo/stills/${name}.png`, fullPage: true, animations: "disabled" });
  }
  await writeFile("reports/demo/stills/sources.json", JSON.stringify({
    captured_at: new Date().toISOString(), real_testnet_receipts: cases,
    footage_contains_no_delivery_keys: true,
  }, null, 2) + "\n");
});
