import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
export type Shot = { name: string; data: string; focus: { x: number; y: number; width: number; height: number } | null; url: string; captured_at: string };
export function recorder(page: any, shots: Shot[]) {
  return async (name: string, selector?: string) => {
    let focus = null;
    if (selector) { const locator = page.locator(selector).first(); await locator.waitFor({ state: 'visible' }); await locator.scrollIntoViewIfNeeded(); focus = await locator.boundingBox(); }
    await page.evaluate(() => document.fonts.ready);
    shots.push({ name, data: (await page.screenshot({ type: 'jpeg', quality: 83, fullPage: false, animations: 'disabled' })).toString('base64'), focus, url: page.url(), captured_at: new Date().toISOString() });
  };
}
export async function downloaded(page: any, label: string) { const waiting = page.waitForEvent('download'); await page.getByRole('button', { name: label, exact: true }).click(); const d = await waiting, file = await d.path(); assert.ok(file); const bytes = await readFile(file); await d.delete(); return bytes; }
export async function clickResponse(page: any, label: string, path: string) {
  const waiting = page.waitForResponse((r: any) => r.url().includes('/api/' + path) && r.request().method() === 'POST' && r.request().postDataJSON()?.step !== 'challenge', { timeout: 90000 });
  await page.getByRole('button', { name: label, exact: true }).click(); const response = await waiting, json = await response.json(); assert.ok(response.ok(), JSON.stringify(json)); return json;
}
export async function navigate(page: any, path: string) { await page.locator(`a[href="${path}"]:visible`).first().click(); await page.waitForURL((url: URL) => url.pathname === path); }
