import assert from 'node:assert/strict';
import { downloaded, recorder, type Shot } from './common.js';
export async function captureSealwork(browser: any) {
  const baseURL = process.env.DEMO_BASE_URL || 'https://sealwork.vercel.app', shots: Shot[] = [], evidence: any[] = [], errors: string[] = [];
  let stage = 'open private bank job';
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), page = await context.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', (e: Error) => errors.push(e.message)); const shot = recorder(page, shots);
  try {
    await page.goto('/new?task=bank&mode=agent', { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Choose a worker within my rules', exact: true }).waitFor(); await shot('01-bank-job', '.form-section');
    stage = 'constrained AI hiring'; await page.getByLabel('Hiring priority').selectOption('balanced'); await page.getByRole('button', { name: 'Choose a worker within my rules', exact: true }).click(); await page.locator('.hiring-recommendation').waitFor({ timeout: 120000 }); await shot('02-hiring-decision', '.hiring-recommendation');
    stage = 'private financial input'; await shot('03-private-records', '.csv-input-card');
    stage = 'attested private bank matching'; await page.getByRole('button', { name: 'Analyze bank payments privately', exact: true }).click(); await page.locator('.bank-decisions').waitFor({ timeout: 150000 }); assert.equal(await page.locator('.bank-decision').count(), 4); assert.equal(await page.getByText('Needs review', { exact: true }).count(), 1); await shot('04-ai-bank-proposal', '.bank-decisions');
    stage = 'approval before payment'; await page.getByRole('checkbox', { name: /I reviewed the proposed matches/ }).check(); await shot('05-acceptance-rules', '.agreed-checks'); await shot('06-job-budget', '.job-summary-card');
    await page.getByRole('button', { name: 'Approve rules & let the agent hire', exact: true }).click(); await page.waitForURL(/\/jobs\/sw_[a-f0-9]{32}/, { timeout: 90000 }); const id = new URL(page.url()).pathname.split('/').at(-1)!;
    stage = 'independent execution and settlement'; await page.locator('.job-detail-heading .pill').filter({ hasText: 'Verified & paid' }).waitFor({ timeout: 150000 }); await shot('07-paid-receipt', '.job-detail-heading');
    assert.equal(await page.locator('.bank-decision').count(), 4); await shot('08-checked-private-result', '.bank-decisions');
    const receiptText = (await downloaded(page, 'Export receipt')).toString(), receipt = JSON.parse(receiptText); assert.equal(receipt.job.outcome, 'accepted'); assert.equal(receipt.job.settlement, 'paid'); assert.ok(!receiptText.includes('Northstar Studio')); evidence.push({ name: 'new accepted bank job', receipt_url: page.url(), job_id: id, build_hash: receipt.job.build_hash, verifier_hash: receipt.job.verifier_hash, outcome: receipt.job.outcome, settlement: receipt.job.settlement });
    const recovery = await downloaded(page, 'Save recovery file');
    stage = 'execution evidence'; for (let i = 0; i < 2; i++) { await page.getByRole('button', { name: 'Inspect attestation', exact: true }).nth(i).click(); await page.getByText('Binary fingerprint matches', { exact: true }).nth(i).waitFor({ timeout: 60000 }); }
    await shot('09-attestation-checks', '.proof-card-heading');
    stage = 'public visitors cannot decrypt'; const other = await context.newPage(); other.setDefaultTimeout(60000); other.on('pageerror', (e: Error) => errors.push(e.message)); const otherShot = recorder(other, shots); await other.goto(`/jobs/${id}`, { waitUntil: 'domcontentloaded' }); await other.getByText('This delivery is encrypted.', { exact: true }).waitFor(); assert.equal(await other.locator('.bank-decision').count(), 0); await otherShot('10-encrypted-public-delivery', '.locked-delivery');
    await other.getByLabel('Import private delivery recovery file').setInputFiles({ name: 'PRIVATE-sealwork-recovery.json', mimeType: 'application/json', buffer: recovery }); await other.getByText('Needs review', { exact: true }).waitFor(); await otherShot('11-recovered-private-delivery', '.bank-decisions'); await other.close();
    stage = 'genuine rejected-work example'; await page.goto('/jobs/sw_cd527cf5498aca5edb472294ca72ade1', { waitUntil: 'domcontentloaded' }); await page.locator('.job-detail-heading .pill').filter({ hasText: 'Rejected · refunded' }).waitFor(); await shot('12-rejected-refunded', '.rejection-explanation'); evidence.push({ name: 'earlier deliberately faulty build example', receipt_url: page.url(), originally_verified_at: '2026-10-31', captured_as_existing_example: true });
    assert.deepEqual(errors, []);
    return { status: 'passed', project: 'Sealwork', source: 'Actual hosted UI captures, edited into a narrated walkthrough', fictional_data: true, private_recovery_excluded: true, paid_live_bank_workflow: true, live_private_ai: true, checked_at: new Date().toISOString(), evidence, browser_errors: errors, shots };
  } catch (e) { try { await shot('failure'); } catch {} return { status: 'failed', project: 'Sealwork', stage, error: (e as Error).message.slice(0, 1400), evidence, browser_errors: errors, shots }; }
  finally { await context.close(); }
}
