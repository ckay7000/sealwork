import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { downloaded } from './common.js';

// One page, one continuous Playwright video. No cuts or skipped waiting time.
export async function recordSealwork(browser: any, scenario: string = 'accepted') {
  assert.ok(['accepted', 'rejected'].includes(scenario));
  const baseURL = process.env.DEMO_BASE_URL || 'https://sealwork.vercel.app', started = Date.now(), timeline: any[] = [], errors: string[] = [];
  const dir = `/tmp/sealwork-recording-${randomUUID()}`;
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, acceptDownloads: true, recordVideo: { dir, size: { width: 1280, height: 800 } } });
  const page = await context.newPage(); const video = page.video(); page.setDefaultTimeout(50000); page.on('pageerror', (e: Error) => errors.push(e.message));
  let stage = 'open app', receipt: any = null, check: any = null, failure: string | undefined;
  async function explain(text: string, selector?: string, dwell = 2000) {
    stage = text; timeline.push({ at_seconds: (Date.now() - started) / 1000, text, url: page.url() });
    await page.evaluate((message: string) => {
      let node = document.getElementById('demo-recording-caption');
      if (!node) { node = document.createElement('div'); node.id = 'demo-recording-caption'; document.body.append(node); }
      node.setAttribute('style', 'position:fixed;left:16px;right:16px;top:8px;z-index:2147483647;background:rgba(20,25,31,.96);color:#fff;padding:10px 16px;border:1px solid #b4caa4;border-radius:8px;font:15px/1.45 Arial,sans-serif;pointer-events:none;box-shadow:0 4px 16px #0003');
      node.replaceChildren(); const label = document.createElement('div'); label.textContent = 'UNINTERRUPTED TESTNET RUN · FICTIONAL RECORDS · REAL WAITING TIME'; label.style.cssText = 'font-size:10px;letter-spacing:1px;color:#b4caa4'; node.append(label, document.createTextNode(message));
    }, text);
    if (selector) await page.locator(selector).first().scrollIntoViewIfNeeded();
    if (dwell) await page.waitForTimeout(dwell);
  }
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' }); await page.locator('.hero-copy h1').waitFor();
    await explain(scenario === 'accepted' ? 'A $900 bank payment covers $500 + $400 invoices. This run creates a fresh paid job.' : 'This run hires a deliberately faulty worker and checks a fresh automatic refund.', '.hero-copy', 3000);
    if (scenario === 'accepted') {
      await page.goto('/new?task=bank&mode=agent', { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Choose a worker within my rules', exact: true }).waitFor();
      await page.getByLabel('Hiring priority').selectOption('balanced'); await explain('The hiring agent recommends a reviewed worker within my rules. I approve the spending.', '.hiring-agent-panel');
      await page.getByRole('button', { name: 'Choose a worker within my rules', exact: true }).click(); await page.locator('.hiring-recommendation').waitFor({ timeout: 70000 });
      await explain('The recommendation identifies one exact worker build. Its history belongs to that code version.', '.hiring-recommendation', 3500);
      await explain('The supplied bank records are fictional. The private model proposes matches from encrypted input.', '.csv-input-card');
      await page.getByRole('button', { name: 'Analyze bank payments privately', exact: true }).click(); await page.locator('.bank-decisions').waitFor({ timeout: 90000 });
      assert.equal(await page.locator('.bank-decision').count(), 4); assert.equal(await page.getByText('Needs review', { exact: true }).count(), 1);
      await explain('$900 is allocated to $500 + $400. The ambiguous $250 stays Needs review.', '.bank-decisions', 5000);
      await page.getByRole('checkbox', { name: /I reviewed the proposed matches/ }).check();
      await explain('I approve the rules. A separate verifier will check the report against the supplied records.', '.agreed-checks', 3500);
      await explain('The 0.050 testnet NEAR fee pays for processing. It does not transfer the fictional bank dollars.', '.job-summary-card', 3500);
      await page.getByRole('button', { name: 'Approve rules & let the agent hire', exact: true }).click();
    } else {
      await page.goto('/new', { waitUntil: 'domcontentloaded' });
      await page.locator('.build-option').filter({ hasText: 'Deliberately faulty update' }).first().getByRole('radio').check();
      await explain('This worker version intentionally corrupts a result. Older versions do not certify this update.', '.build-option.selected', 4000);
      await page.getByRole('checkbox', { name: /I agree to these checks/ }).check();
      await explain('The budget is reserved under the same independent checks. Failed work must not be paid.', '.job-summary-card', 4000);
      await page.getByRole('button', { name: 'Encrypt & fund the job', exact: true }).click();
    }
    await page.waitForURL(/\/jobs\/sw_[a-f0-9]{32}/, { timeout: 70000 }); const id = new URL(page.url()).pathname.split('/').at(-1)!;
    await explain('Fresh job funded. Worker and independent verifier are running; this wait is included.', '.job-detail-heading', 0);
    await page.locator('.job-detail-heading .pill').filter({ hasText: scenario === 'accepted' ? 'Verified & paid' : 'Rejected · refunded' }).waitFor({ timeout: 140000 });
    await explain(scenario === 'accepted' ? 'The checks passed and NEAR paid the worker. The supplied financial records stayed encrypted.' : 'The separate checker rejected the faulty result. NEAR returned the reserved budget to the buyer.', '.job-detail-heading', 5000);
    const receiptText = (await downloaded(page, 'Export receipt')).toString(); receipt = JSON.parse(receiptText);
    assert.equal(receipt.job.outcome, scenario); assert.equal(receipt.job.settlement, scenario === 'accepted' ? 'paid' : 'refunded'); assert.ok(!receiptText.includes('Northstar Studio'));
    if (scenario === 'accepted') {
      await explain('The checked private report preserves Needs review. The buyer can inspect it here.', '.bank-decisions', 5000);
      const recovery = await downloaded(page, 'Save recovery file');
      await page.evaluate((jobId: string) => sessionStorage.removeItem(`sealwork:private:${jobId}`), id); await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText('This delivery is encrypted.', { exact: true }).waitFor(); assert.equal(await page.locator('.bank-decision').count(), 0);
      await explain('With this browser\'s private key removed, the public page cannot read the delivery.', '.locked-delivery', 4000);
      await page.getByLabel('Import private delivery recovery file').setInputFiles({ name: 'PRIVATE-sealwork-recovery.json', mimeType: 'application/json', buffer: recovery });
      await page.getByText('Needs review', { exact: true }).waitFor(); await explain('Importing the private recovery file restores access. Its secret contents are excluded from the recording.', '.bank-decisions', 4000);
    } else await explain('The receipt records the failed checks and refund. This is the job just created, not an earlier example.', '.rejection-explanation', 5000);
    await page.getByRole('link', { name: 'Check receipt directly against NEAR' }).click(); await page.waitForURL(/\/verify\//);
    await explain('Read the receipt directly from NEAR and hash the published code. No wallet or private report is needed.', '.receipt-check-intro', 2000);
    await page.getByRole('button', { name: 'Check directly against NEAR', exact: true }).click();
    await page.getByRole('heading', { name: 'The public receipt is consistent.', exact: true }).waitFor({ timeout: 60000 });
    check = JSON.parse((await downloaded(page, 'Export check report')).toString()); assert.equal(check.passed, true); assert.equal(check.hardware_quote_verified, false);
    await explain('The finalized outcome, recipient and downloaded code match. This checks public consistency, not private recomputation.', '.receipt-check-report', 6500);
    await explain('Hardware-quote verification and real invoice authenticity remain separate trust checks.', '.receipt-check-boundaries', 5000);
    assert.deepEqual(errors, []);
  } catch (e) { failure = (e as Error).message.slice(0, 1600); }
  finally { await context.close(); }
  const file = await video!.path(), bytes = await readFile(file); await rm(dir, { recursive: true, force: true });
  return { status: failure ? 'failed' : 'passed', stage, error: failure, project: 'Sealwork', scenario, checked_at: new Date().toISOString(), source: 'One uninterrupted Playwright page video; natural waits included; explanatory overlay only', fictional_data: true, private_recovery_excluded: true, timeline, receipt, check, browser_errors: errors, video_sha256: createHash('sha256').update(bytes).digest('hex'), video_bytes: bytes.length, video_base64: bytes.toString('base64') };
}

export async function checkPublicPages(browser: any) {
  const context = await browser.newContext({ baseURL: 'https://sealwork.vercel.app', viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage(), checks: any[] = [], errors: string[] = [];
  page.on('pageerror', (e: Error) => errors.push(e.message)); page.setDefaultTimeout(60000);
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' }); await page.locator('.hero-copy h1').waitFor();
    for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      checks.push({ page: 'home', viewport: size, status: 'passed' });
    }
    for (const id of ['sw_ff38ff3fb1bffdbe977722e432bfc5e2', 'sw_cd527cf5498aca5edb472294ca72ade1', 'sw_23a46154077f9c6cfc1c3a8fc930f76f']) {
      await page.goto(`/verify/${id}`, { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Check directly against NEAR', exact: true }).click();
      await page.getByRole('heading', { name: 'The public receipt is consistent.', exact: true }).waitFor();
      const report = JSON.parse((await downloaded(page, 'Export check report')).toString()); assert.equal(report.passed, true);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      checks.push({ page: 'direct receipt check', job_id: id, viewport: { width: 390, height: 844 }, status: 'passed', report });
    }
    assert.deepEqual(errors, []);
    return { status: 'passed', checked_at: new Date().toISOString(), checks, browser_errors: errors };
  } finally { await context.close(); }
}
