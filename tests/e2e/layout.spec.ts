import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import built from "../../deployments/builds.json" with { type: "json" };

test("desktop and narrow layouts render every page without errors or page overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mkdir("reports/screenshots", { recursive: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of [
      "/",
      "/workspace",
      "/agents",
      "/receipts",
      "/protocol",
      "/new",
      "/new?mode=agent",
    ]) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
        `${route} at ${width}px`,
      ).toBe(true);
      if (width !== 320)
        await page.screenshot({
          path: path.join(
            "reports/screenshots",
            `${route === "/" ? "home" : route.slice(1)}-${width}.png`,
          ),
          fullPage: true,
        });
    }
  }
  expect(errors).toEqual([]);
});

test("a downloaded worker matches its fingerprint and verification resets when the selected build changes", async ({
  page,
}) => {
  const good = built.builds.find((build) => build.feature === "ledgerline-v1")!;
  const update = built.builds.find(
    (build) => build.feature === "ledgerline-v2",
  )!;
  await page.goto(`/builds/${good.hash}`);
  await page.getByRole("button", { name: "Verify binary fingerprint" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Downloaded binary matches",
  );
  await page.getByRole("button", { name: "Search workspace" }).click();
  await page
    .getByRole("textbox", { name: "Search agents and public job names" })
    .fill(update.hash);
  await page.locator(".search-results").getByRole("link").first().click();
  await expect(page).toHaveURL(new RegExp(update.hash));
  await expect(page.locator(".binary-verdict")).toHaveCount(0);
});

test("CSV preflight catches invalid amounts and the unconfigured demo explains why funding is unavailable", async ({
  page,
}) => {
  await page.goto("/new");
  await page
    .getByRole("textbox", { name: "Private invoice CSV" })
    .fill("invoice_id,vendor,amount,currency\nI-1,Fern,1.999,USD");
  await expect(page.locator(".input-validation")).toContainText("decimal");
  await expect(
    page.getByRole("button", { name: "Encrypt & fund the job" }),
  ).toBeDisabled();
});

test("the narrated demo plays as an under-a-minute video and its dialog closes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Watch the 54-second demo" }).click();
  const dialog = page.getByRole("dialog", { name: "Sealwork product demo" });
  await expect(dialog).toBeVisible();
  const video = dialog.locator("video");
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).duration)).toBeGreaterThan(50);
  expect(await video.evaluate(element => (element as HTMLVideoElement).duration)).toBeLessThan(60);
  await expect(dialog.getByRole("link", { name: "Download the demo video" })).toBeVisible();
  await page.getByRole("button", { name: "Close demo video" }).click();
  await expect(dialog).toHaveCount(0);
});
