import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { bridgeRequest, closeBridge } from './tool-bridge.mjs';
const auth = process.env.VERCEL_TOKEN ? { token: process.env.VERCEL_TOKEN } : JSON.parse(await readFile('/root/.local/share/com.vercel.cli/auth.json', 'utf8'));
const web = JSON.parse(await readFile('.local/capture-web.json', 'utf8')); await mkdir('.local/bridge', { recursive: true, mode: 0o700 });
const headerFile = path.resolve('.local/bridge/vercel.headers'); await writeFile(headerFile, `Authorization: Bearer ${auth.token}\nContent-Type: application/json\n`, { mode: 0o600 });
try { const r = await bridgeRequest(`https://api.vercel.com/v13/deployments/${web.deployment_id}?teamId=team_osASFxy0lZFhvkPehOUzYAXS`, 'GET', undefined, headerFile); web.state = r.readyState; await writeFile('.local/capture-web.json', JSON.stringify(web)); console.log('Capture service:', r.readyState); if (r.readyState === 'ERROR') { const e = await bridgeRequest(`https://api.vercel.com/v3/deployments/${web.deployment_id}/events?teamId=team_osASFxy0lZFhvkPehOUzYAXS`, 'GET', undefined, headerFile); console.log(e.map((x: any) => x.text).filter((x: string) => /error/i.test(x)).join('\n')); } } finally { await rm(headerFile, { force: true }); closeBridge(); }
