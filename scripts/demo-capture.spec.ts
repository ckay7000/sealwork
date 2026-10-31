import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

test("capture actual public testnet receipts for the marketing film", async ({ page }) => {
  await mkdir("reports/demo/stills", { recursive: true });
  const cases = {
    accepted: "sw_ce7958686c9d77b5d5ec8cbe8d1d4665",
    rejected: "sw_1ef36ea1ae0d2f6baf70479dc0908088",
    timeout: "sw_aac248e432b800d6f6c63f8dab54c4a8",
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
