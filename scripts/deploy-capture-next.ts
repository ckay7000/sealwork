import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { bridgeRequest, closeBridge } from './tool-bridge.mjs';
const name = 'sealwork-next-capture', team = 'team_osASFxy0lZFhvkPehOUzYAXS';
const auth = process.env.VERCEL_TOKEN ? { token: process.env.VERCEL_TOKEN } : JSON.parse(await readFile('/root/.local/share/com.vercel.cli/auth.json', 'utf8'));
await mkdir('.local/bridge', { recursive: true, mode: 0o700 }); const headerFile = path.resolve('.local/bridge/vercel.headers'); await writeFile(headerFile, `Authorization: Bearer ${auth.token}\nContent-Type: application/json\n`, { mode: 0o600 });
const api = (route: string, method = 'GET', body?: unknown) => bridgeRequest(`https://api.vercel.com${route}${route.includes('?') ? '&' : '?'}teamId=${team}`, method, body, headerFile);
try {
  const projects = await api('/v9/projects?limit=100'); let project = projects.projects.find((p: any) => p.name === name);
  if (!project) project = await api('/v11/projects', 'POST', { name, framework: null, installCommand: 'npm ci' });
  await api(`/v9/projects/${project.id}`, 'PATCH', { nodeVersion: '24.x' });
  const current = await api(`/v10/projects/${project.id}/env`), env = current.envs.find((e: any) => e.key === 'CAPTURE_SECRET');
  await api(`/v10/projects/${project.id}/env${env ? '/' + env.id : ''}`, env ? 'PATCH' : 'POST', { key: 'CAPTURE_SECRET', value: (await readFile('.local/capture-secret', 'utf8')).trim(), type: 'encrypted', target: ['production'] });
  const browserEnv = current.envs.find((e: any) => e.key === 'PLAYWRIGHT_BROWSERS_PATH');
  await api(`/v10/projects/${project.id}/env${browserEnv ? '/' + browserEnv.id : ''}`, browserEnv ? 'PATCH' : 'POST', { key: 'PLAYWRIGHT_BROWSERS_PATH', value: '/tmp/pw-recorders', type: 'plain', target: ['production'] });
  const files: any[] = [];
  async function walk(dir: string) { for (const entry of await readdir(`.local/capture-source/${dir}`, { withFileTypes: true })) { const file = dir ? `${dir}/${entry.name}` : entry.name; if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue; if (entry.isDirectory()) await walk(file); else files.push({ file, data: (await readFile(`.local/capture-source/${file}`)).toString('base64'), encoding: 'base64' }); } }
  await walk('');
  const deployment = await api('/v13/deployments', 'POST', { name, project: project.id, target: 'production', files, projectSettings: { framework: null, nodeVersion: '24.x', installCommand: 'npm ci', buildCommand: '' } });
  await writeFile('.local/capture-web.json', JSON.stringify({ project_id: project.id, deployment_id: deployment.id, url: `https://${name}.vercel.app`, state: deployment.readyState }, null, 2)); console.log('Capture service queued:', deployment.id);
} finally { await rm(headerFile, { force: true }); closeBridge(); }
