import { CHECKS } from './types';
import type { AgentBuild, Job } from './types';

export type PublicCheck = { id: string; label: string; passed: boolean; detail: string };
export type ReceiptReport = {
  schema: 'sealwork.public-receipt-check.v1';
  checked_at: string; contract_id: string; job_id: string;
  block_hash: string; block_height: number;
  outcome: string | null; settlement: string;
  checks: PublicCheck[]; passed: boolean;
  scope: string; hardware_quote_verified: false; private_result_recomputed: false;
};
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const integer = (v: unknown): v is string => typeof v === 'string' && /^\d{1,40}$/.test(v);

export function receiptChecks(value: unknown, expectedId: string, build: unknown, config: unknown): PublicCheck[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The contract returned no job record.');
  const j = value as Job, b = build as AgentBuild | null;
  const c = config as { verifier_hash?: string } | null;
  const checks: PublicCheck[] = [];
  const add = (id: string, label: string, passed: boolean, detail: string) => checks.push({ id, label, passed, detail });
  add('identity', 'The requested job exists on NEAR', j.id === expectedId, expectedId);
  add('fingerprints', 'Worker, verifier and input fingerprints are valid', hash(j.build_hash) && hash(j.verifier_hash) && hash(j.manifest_hash) && hash(j.input_commitment), 'Each fingerprint must be a 64-character SHA-256 value.');
  add('registered_build', 'The worker matches its registered provider', !!b && b.hash === j.build_hash && b.manifest_hash === j.manifest_hash && b.provider_id === j.provider_id, 'Read from the same NEAR block as the job.');
  add('pinned_verifier', 'The job uses the contract’s pinned verifier', hash(j.verifier_hash) && j.verifier_hash === c?.verifier_hash, j.verifier_hash || 'Missing verifier fingerprint.');
  const settled = j.state === 'settled' && ['accepted', 'rejected', 'timed_out', 'execution_error'].includes(j.outcome || '');
  add('final_outcome', 'A permanent outcome has been recorded', settled, `Outcome: ${j.outcome || 'still running'}.`);
  const exactChecks = Array.isArray(j.checks) && j.checks.length === CHECKS.length && j.checks.every((ch, i) => ch && typeof ch === 'object' && ch.id === CHECKS[i].id && typeof ch.passed === 'boolean');
  const acceptance = j.outcome === 'accepted' ? exactChecks && j.checks.every(ch => ch.passed)
    : j.outcome === 'rejected' ? exactChecks && j.checks.some(ch => !ch.passed)
    : settled;
  add('acceptance', 'The recorded checks agree with the outcome', acceptance, 'Acceptance requires all six checks; rejection requires at least one failed check. This reads the recorded checks; it does not rerun private computation.');
  const paid = j.outcome === 'accepted';
  add('settlement', 'The transfer finished for the correct recipient', settled && j.settlement === (paid ? 'paid' : 'refunded') && j.settlement_recipient === (paid ? j.provider_id : j.buyer_id), `${j.settlement || 'unknown'} → ${j.settlement_recipient || 'unknown recipient'}.`);
  add('amount', 'The settled amount covers the reserved worker budget', integer(j.budget) && integer(j.settlement_amount) && BigInt(j.budget) > 0n && BigInt(j.settlement_amount) >= BigInt(j.budget), 'Worker budget plus any unspent reserved compute; consumed execution and storage costs are separate.');
  const validTime = integer(j.created_at) && integer(j.deadline) && integer(j.settled_at) && BigInt(j.created_at) < BigInt(j.deadline) && BigInt(j.settled_at!) >= BigInt(j.created_at);
  const deadline = validTime && (j.outcome === 'timed_out' ? BigInt(j.settled_at!) >= BigInt(j.deadline) : ['accepted', 'rejected'].includes(j.outcome || '') ? BigInt(j.settled_at!) < BigInt(j.deadline) : true);
  add('deadline', 'The outcome agrees with the deadline rule', deadline, 'A timeout must occur after expiry; accepted or rejected delivery must be decided before it.');
  add('result_binding', 'Accepted or rejected work has a committed encrypted result', !['accepted', 'rejected'].includes(j.outcome || '') || (hash(j.result_commitment) && typeof j.result_ciphertext === 'string' && j.result_ciphertext.length > 0), 'Public commitments identify the result without exposing the report.');
  return checks;
}

export async function checkPublicReceipt(options: { jobId: string; contractId: string; rpcUrl?: string; siteUrl?: string; fetcher?: typeof fetch }): Promise<ReceiptReport> {
  if (!/^sw_[a-f0-9]{32}$/.test(options.jobId)) throw new Error('Use a complete Sealwork job ID.');
  if (!/^[a-z0-9_.-]+\.testnet$/.test(options.contractId) || options.contractId.length > 64) throw new Error('Use the NEAR testnet contract named in the receipt.');
  const fetcher = options.fetcher || fetch;
  const rpc = options.rpcUrl || 'https://test.rpc.fastnear.com';
  let sequence = 0;
  async function view(method: string, args: unknown, block?: string) {
    const response = await fetcher(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000), body: JSON.stringify({ jsonrpc: '2.0', id: ++sequence, method: 'query', params: { request_type: 'call_function', account_id: options.contractId, method_name: method, args_base64: btoa(JSON.stringify(args)), ...(block ? { block_id: block } : { finality: 'final' }) } }) });
    if (!response.ok) throw new Error('The public NEAR RPC could not complete the read.');
    const result = await response.json();
    if (result.error || !result.result || !Array.isArray(result.result.result)) throw new Error('NEAR refused the requested contract read.');
    if (typeof result.result.block_hash !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(result.result.block_hash) || !Number.isSafeInteger(result.result.block_height) || result.result.block_height < 1 || (block && result.result.block_hash !== block)) throw new Error('NEAR did not return a consistent finalized block.');
    return { value: JSON.parse(new TextDecoder().decode(Uint8Array.from(result.result.result))), block_hash: result.result.block_hash as string, block_height: result.result.block_height as number };
  }
  const record = await view('get_job', { job_id: options.jobId });
  if (!record.value || !hash(record.value.build_hash)) throw new Error('This contract has no matching job with a valid worker fingerprint.');
  const [build, config] = await Promise.all([view('get_build', { hash: record.value.build_hash }, record.block_hash), view('get_config', {}, record.block_hash)]);
  const checks = receiptChecks(record.value, options.jobId, build.value, config.value);
  const site = new URL(options.siteUrl || 'https://sealwork.vercel.app');
  if (site.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(site.hostname)) throw new Error('Use an HTTPS site for published worker files.');
  for (const [phase, fingerprint] of [['worker', record.value.build_hash], ['verifier', record.value.verifier_hash]] as const) {
    if (!hash(fingerprint)) continue;
    const url = new URL(`/wasm/${fingerprint}.wasm`, site).href;
    let passed = false, detail = url;
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error('The published file is unavailable.');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 15000000) throw new Error('The file exceeds the verifier’s size limit.');
      const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
      passed = actual === fingerprint; detail = passed ? `Downloaded SHA-256 matches ${fingerprint}.` : 'Downloaded bytes do not match the onchain fingerprint.';
    } catch (e) { detail = (e as Error).message; }
    checks.push({ id: `${phase}_bytes`, label: `The downloaded ${phase} code matches its fingerprint`, passed, detail });
  }
  return { schema: 'sealwork.public-receipt-check.v1', checked_at: new Date().toISOString(), contract_id: options.contractId, job_id: options.jobId, block_hash: record.block_hash, block_height: record.block_height, outcome: record.value.outcome, settlement: record.value.settlement, checks, passed: checks.every(c => c.passed), scope: 'Direct final NEAR reads and downloaded executable SHA-256 checks. Recorded acceptance is inspected, not privately recomputed. Hardware quotes require separate OutLayer verification. RPC, published code and contract upgrade authority remain trust dependencies.', hardware_quote_verified: false, private_result_recomputed: false };
}
