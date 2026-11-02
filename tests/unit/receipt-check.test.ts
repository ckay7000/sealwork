import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkPublicReceipt, receiptChecks } from '../../shared/receipt-check';
import { CHECKS } from '../../shared/types';

const id = `sw_${'1'.repeat(32)}`, worker = new TextEncoder().encode('published worker'), verifier = new TextEncoder().encode('published verifier');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const build = { hash: sha(worker), manifest_hash: '2'.repeat(64), provider_id: 'worker.testnet' };
const config = { verifier_hash: sha(verifier) };
const job = () => ({ id, build_hash: build.hash, manifest_hash: build.manifest_hash, provider_id: build.provider_id, buyer_id: 'buyer.testnet', verifier_hash: config.verifier_hash, input_commitment: '3'.repeat(64), state: 'settled', outcome: 'accepted', checks: CHECKS.map(c => ({ id: String(c.id), passed: true })), budget: '50000000000000000000000', settlement_amount: '55000000000000000000000', settlement: 'paid', settlement_recipient: build.provider_id, created_at: '1000', deadline: '2000', settled_at: '1500', result_commitment: '4'.repeat(64), result_ciphertext: 'encrypted-demo-result' });
const passes = (j: unknown, b: unknown = build, c: unknown = config) => receiptChecks(j, id, b, c).every(c => c.passed);

describe('public receipt consistency and its limits', () => {
  it('accepts a completed paid job and a correctly refunded rejection', () => {
    expect(passes(job())).toBe(true);
    const rejected = { ...job(), outcome: 'rejected', settlement: 'refunded', settlement_recipient: 'buyer.testnet' };
    rejected.checks[2].passed = false;
    expect(passes(rejected)).toBe(true);
    expect(passes({ ...rejected, outcome: 'accepted' })).toBe(false);
    expect(passes({ ...job(), outcome: 'rejected', settlement: 'refunded', settlement_recipient: 'buyer.testnet' })).toBe(false);
  });
  it.each(['missing', 'extra', 'reordered', 'duplicate', 'null', 'nonboolean'])('fails closed for %s recorded acceptance checks', variant => {
    const j = job();
    if (variant === 'missing') j.checks.pop();
    if (variant === 'extra') j.checks.push({ id: 'invented', passed: true });
    if (variant === 'reordered') j.checks.reverse();
    if (variant === 'duplicate') j.checks[1] = { ...j.checks[0] };
    if (variant === 'null') (j.checks as unknown[])[0] = null;
    if (variant === 'nonboolean') (j.checks as unknown[])[0] = { id: CHECKS[0].id, passed: 'true' };
    expect(passes(j)).toBe(false);
  });
  it('rejects altered identity, provider, manifest, pinned verifier and result commitment', () => {
    for (const change of [{ id: `${id}2` }, { provider_id: 'imposter.testnet' }, { manifest_hash: '5'.repeat(64) }, { verifier_hash: '6'.repeat(64) }, { result_commitment: null }, { result_ciphertext: '' }, { input_commitment: 'bad' }]) expect(passes({ ...job(), ...change })).toBe(false);
    expect(passes(job(), null)).toBe(false);
    expect(passes(job(), build, null)).toBe(false);
  });
  it('requires finished payment to the right party and at least the agreed budget', () => {
    for (const change of [{ state: 'funded' }, { settlement: 'pending' }, { settlement: 'claimable' }, { settlement_recipient: 'buyer.testnet' }, { settlement_amount: '1' }, { budget: '0' }, { budget: '-1' }, { settlement_amount: '1e30' }]) expect(passes({ ...job(), ...change })).toBe(false);
  });
  it('enforces delivery before deadline and timeout only after expiry', () => {
    expect(passes({ ...job(), settled_at: '2000' })).toBe(false);
    expect(passes({ ...job(), settled_at: '999' })).toBe(false);
    const timeout = { ...job(), outcome: 'timed_out', settled_at: '2000', settlement: 'refunded', settlement_recipient: 'buyer.testnet', checks: [], result_commitment: null, result_ciphertext: null };
    expect(passes(timeout)).toBe(true);
    expect(passes({ ...timeout, settled_at: '1999' })).toBe(false);
  });
});

function rpcFetcher(options: { tamper?: boolean; wrongBlock?: boolean } = {}) {
  const calls: any[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const request = JSON.parse(String(init.body)); calls.push(request.params);
      const value = request.params.method_name === 'get_job' ? job() : request.params.method_name === 'get_build' ? build : config;
      return Response.json({ result: { result: Array.from(new TextEncoder().encode(JSON.stringify(value))), block_hash: options.wrongBlock && request.params.method_name === 'get_build' ? 'B'.repeat(44) : 'A'.repeat(44), block_height: 12345 } });
    }
    const bytes = String(url).includes(build.hash) ? worker : verifier;
    return new Response(options.tamper ? new Uint8Array([0, 1]) : bytes);
  }) as typeof fetch;
  return { calls, fetcher };
}
describe('direct RPC and published byte verification', () => {
  it('pins dependent reads to one final block and hashes actual downloaded bytes', async () => {
    const { calls, fetcher } = rpcFetcher();
    const report = await checkPublicReceipt({ jobId: id, contractId: 'market.testnet', fetcher });
    expect(report.passed).toBe(true);
    expect(calls[0].finality).toBe('final');
    expect(calls.slice(1).map(c => c.block_id)).toEqual(['A'.repeat(44), 'A'.repeat(44)]);
    expect(report.hardware_quote_verified).toBe(false);
    expect(report.private_result_recomputed).toBe(false);
  });
  it('detects substituted published executable bytes', async () => {
    const report = await checkPublicReceipt({ jobId: id, contractId: 'market.testnet', fetcher: rpcFetcher({ tamper: true }).fetcher });
    expect(report.passed).toBe(false);
    expect(report.checks.filter(c => c.id.endsWith('_bytes')).every(c => !c.passed)).toBe(true);
  });
  it('rejects an RPC response from a different dependent block', async () => {
    await expect(checkPublicReceipt({ jobId: id, contractId: 'market.testnet', fetcher: rpcFetcher({ wrongBlock: true }).fetcher })).rejects.toThrow('consistent finalized block');
  });
});
