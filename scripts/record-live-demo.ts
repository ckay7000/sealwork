// Creates a real sponsored testnet job. Use fictional data; see docs/DEMO.md.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { recordSealwork } from './demo-capture/continuous.js';
const scenario = process.argv[2] || 'accepted';
if (!['accepted', 'rejected'].includes(scenario)) throw new Error('Use accepted or rejected.');
const browser = await chromium.launch({ headless: true });
try {
  const report = await recordSealwork(browser, scenario);
  const bytes = Buffer.from(report.video_base64, 'base64');
  const { video_base64: omitted, ...publicReport } = report;
  await mkdir('reports/continuous-demo', { recursive: true });
  await writeFile(`reports/continuous-demo/${scenario}-raw.webm`, bytes);
  await writeFile(`reports/continuous-demo/${scenario}-capture.json`, JSON.stringify(publicReport, null, 2) + '\n');
  if (report.status !== 'passed') throw new Error('Recording failed at ' + report.stage + ': ' + report.error);
  console.log('Uninterrupted recording passed:', scenario, report.receipt.job.id);
} finally { await browser.close(); }
