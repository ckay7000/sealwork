import { createInterface } from 'node:readline';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
let sequence = 0; let waiting = null;
let lane = Promise.resolve();
const enabled = process.env.PACKAGE_TOOL_BRIDGE === '1';
const input = enabled ? createInterface({ input: process.stdin }) : null;
input?.on('line', line => { if (line.trim() === 'continue' && waiting) { const next = waiting; waiting = null; next(); } });
export async function bridgeRequest(url, method, payload, headerFile, binaryFile, responseType = "json") {
  const previous = lane; let release; lane = new Promise(resolve => { release = resolve; }); await previous;
  try {
  if (!['https://api.vercel.com', 'https://api.github.com', 'https://test.rpc.fastnear.com', 'https://helper.testnet.near.org', 'https://sealwork-next.vercel.app', 'https://accord-near.vercel.app', 'https://testnet-api.outlayer.ai'].includes(new URL(url).origin)) throw new Error('Unapproved bridge origin.');
  await mkdir('.local/bridge', { recursive: true, mode: 0o700 }); const prefix = path.resolve(`.local/bridge/request-${process.pid}-${randomUUID()}-${++sequence}`);
  const file = binaryFile || `${prefix}.json`; const response = `${prefix}-response.json`;
  if (payload !== undefined) await writeFile(file, JSON.stringify(payload), { mode: 0o600 });
  const ready = new Promise(resolve => { waiting = resolve; });
  console.log('PACKAGE_HTTP_REQUEST ' + JSON.stringify({ url, method, file: payload !== undefined || binaryFile ? file : null, response, headerFile: headerFile || null, responseType }));
  await ready;
  if (responseType === 'binary') return await readFile(response);
  const raw = await readFile(response, 'utf8'); const result = raw.trim() ? JSON.parse(raw) : {};
  if (result.error) throw new Error(JSON.stringify(result.error));
  return result;
  } finally { release(); }
}
export function closeBridge() { input?.close(); }
