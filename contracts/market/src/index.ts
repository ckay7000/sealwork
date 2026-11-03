import { NearBindgen, call, view, initialize, near, assert, validateAccountId } from 'near-sdk-js';

const TGAS = 1_000_000_000_000n;
const NEAR = 10n ** 24n;
const JOB_STORAGE_BYTES = 16384n;
const BUILD_STORAGE_BYTES = 2048n;
const MAX_AMOUNT = (1n << 128n) - 1n;
const CHECK_IDS = ['row_count', 'unique_ids', 'amounts_preserved', 'vendor_integrity', 'ledger_matches', 'delivery_integrity'];

type Outcome = 'accepted' | 'rejected' | 'timed_out' | 'execution_error';
type Check = { id: string; passed: boolean };
type Build = {
  hash: string; manifest_hash: string; agent_id: string; name: string; version: string;
  provider_id: string; wasm_url: string; description: string; created_at: string;
  accepted: number; rejected: number; timed_out: number; execution_errors: number; earned: string;
};
type Job = {
  id: string; title: string; buyer_id: string; provider_id: string; build_hash: string;
  manifest_hash: string; verifier_hash: string; input_commitment: string; profile: string;
  budget: string; compute_remaining: string; storage_deposit: string;
  compute_refund_amount: string; compute_refund_state: 'none' | 'pending' | 'paid' | 'claimable';
  state: 'funded' | 'agent_running' | 'verifier_running' | 'settled';
  outcome: Outcome | null; settlement: 'pending' | 'paid' | 'refunded' | 'claimable';
  settlement_amount: string; settlement_recipient: string; created_at: string; deadline: string;
  settled_at: string | null; agent_request_id: string | null; verifier_request_id: string | null;
  agent_transaction_hash: string | null; verifier_transaction_hash: string | null;
  result_commitment: string | null; result_ciphertext: string | null; checks: Check[]; reason: string | null;
};

function amount(value: string): bigint {
  assert(typeof value === 'string' && /^(0|[1-9][0-9]{0,38})$/.test(value), 'Invalid integer amount');
  const result = BigInt(value);
  assert(result <= MAX_AMOUNT, 'Amount exceeds NEAR token range');
  return result;
}
function hash(value: string): boolean { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function executionReference(output: Record<string, unknown>): boolean {
  const request = output.request_id;
  const transaction = output.transaction_hash;
  const requestValid = typeof request === 'string' && /^[0-9]{1,20}$/.test(request);
  const transactionValid = typeof transaction === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(transaction);
  return (request == null || requestValid) && (transaction == null || transactionValid) && (requestValid || transactionValid);
}
function json<T>(key: string): T | null {
  const raw = near.storageRead(key);
  return raw === null ? null : JSON.parse(raw) as T;
}
function save(key: string, value: unknown): void { near.storageWrite(key, JSON.stringify(value)); }
function event(name: string, data: unknown): void {
  near.log(`EVENT_JSON:${JSON.stringify({ standard: 'sealwork', version: '1.0.0', event: name, data: [data] })}`);
}

@NearBindgen({ requireInit: true })
export class SealworkMarket {
  owner_id = '';
  outlayer_contract_id = '';
  project_id = '';
  verifier_hash = '';
  verifier_manifest_hash = '';
  demo_buyer_id = '';
  demo_daily_limit = 30;
  demo_day = '';
  demo_jobs_today = 0;
  job_count = 0;
  build_count = 0;

  @initialize({})
  init({ owner_id, outlayer_contract_id, project_id, verifier_hash, verifier_manifest_hash, demo_buyer_id = '', demo_daily_limit = 30 }: {
    owner_id: string; outlayer_contract_id: string; project_id: string; verifier_hash: string;
    verifier_manifest_hash: string; demo_buyer_id?: string; demo_daily_limit?: number;
  }) {
    assert(validateAccountId(owner_id) && validateAccountId(outlayer_contract_id), 'Invalid account identifier');
    assert(hash(verifier_hash) && hash(verifier_manifest_hash), 'Verifier hashes must identify exact binaries and manifests');
    assert(typeof project_id === 'string' && project_id.length <= 128 && project_id.includes('/'), 'Invalid OutLayer project');
    assert(demo_buyer_id === '' || validateAccountId(demo_buyer_id), 'Invalid demo buyer');
    assert(Number.isInteger(demo_daily_limit) && demo_daily_limit >= 1 && demo_daily_limit <= 100, 'Invalid demo limit');
    this.owner_id = owner_id;
    this.outlayer_contract_id = outlayer_contract_id;
    this.project_id = project_id;
    this.verifier_hash = verifier_hash;
    this.verifier_manifest_hash = verifier_manifest_hash;
    this.demo_buyer_id = demo_buyer_id;
    this.demo_daily_limit = demo_daily_limit;
  }

  @call({ payableFunction: true })
  register_build({ hash: build_hash, manifest_hash, agent_id, name, version, provider_id, wasm_url, description }: {
    hash: string; manifest_hash: string; agent_id: string; name: string; version: string;
    provider_id: string; wasm_url: string; description: string;
  }): Build {
    assert(near.predecessorAccountId() === this.owner_id, 'Only the curator can publish a reviewed build');
    assert(hash(build_hash) && hash(manifest_hash), 'Invalid build fingerprint');
    assert(json(`build:${build_hash}`) === null, 'A published build is immutable');
    assert(/^[a-z0-9_-]{2,40}$/.test(agent_id), 'Invalid agent identifier');
    assert(typeof name === 'string' && name.length >= 2 && name.length <= 48, 'Invalid agent name');
    assert(typeof version === 'string' && version.length >= 1 && version.length <= 24, 'Invalid version');
    assert(validateAccountId(provider_id), 'Invalid provider account');
    assert(/^https:\/\/[^\s]+$/.test(wasm_url) && wasm_url.length <= 400, 'Published code requires an HTTPS URL');
    assert(typeof description === 'string' && description.length <= 500, 'Description is too long');
    const required = BUILD_STORAGE_BYTES * near.storageByteCost();
    assert(near.attachedDeposit() >= required, 'Attach the build storage deposit');
    const build: Build = {
      hash: build_hash, manifest_hash, agent_id, name, version, provider_id, wasm_url, description,
      created_at: near.blockTimestamp().toString(), accepted: 0, rejected: 0, timed_out: 0, execution_errors: 0, earned: '0',
    };
    save(`build:${build_hash}`, build);
    save(`build_index:${this.build_count++}`, build_hash);
    const excess = near.attachedDeposit() - required;
    if (excess > 0n) {
      const refund = near.promiseBatchCreate(near.predecessorAccountId());
      near.promiseBatchActionTransfer(refund, excess);
    }
    event('build_published', { hash: build_hash, agent_id, version, provider_id });
    return build;
  }

  @call({ payableFunction: true })
  create_job({ job_id, title, build_hash, input_commitment, budget, compute_deposit, deadline_seconds = 180 }: {
    job_id: string; title: string; build_hash: string; input_commitment: string;
    budget: string; compute_deposit: string; deadline_seconds?: number;
  }): Job {
    assert(/^sw_[a-f0-9]{32}$/.test(job_id), 'Invalid job identifier');
    assert(json(`job:${job_id}`) === null, 'Job already exists');
    assert(typeof title === 'string' && title.length >= 3 && title.length <= 120 && !/[\x00-\x1f]/.test(title), 'Use a short public job title');
    assert(hash(input_commitment), 'Invalid private-input commitment');
    const build = json<Build>(`build:${build_hash}`);
    assert(build !== null, 'Select an existing immutable build');
    assert(Number.isInteger(deadline_seconds) && deadline_seconds >= 5 && deadline_seconds <= 86400, 'Deadline must be 5 seconds to 24 hours');
    const budgetValue = amount(budget);
    const compute = amount(compute_deposit);
    assert(budgetValue > 0n && budgetValue <= 100n * NEAR, 'Budget must be positive and at most 100 NEAR');
    assert(compute >= 2n * 10n ** 21n && compute <= NEAR && compute % 2n === 0n, 'Fund both executions with a valid compute deposit');
    const storage = JOB_STORAGE_BYTES * near.storageByteCost();
    assert(near.attachedDeposit() === budgetValue + compute + storage, 'Attach exactly the budget, compute deposit, and storage deposit');
    const buyer = near.predecessorAccountId();
    if (buyer === this.demo_buyer_id) {
      const day = (near.blockTimestamp() / (86400n * 1_000_000_000n)).toString();
      if (this.demo_day !== day) { this.demo_day = day; this.demo_jobs_today = 0; }
      assert(this.demo_jobs_today < this.demo_daily_limit, 'The sponsored demo has reached its daily job allowance');
      assert(budgetValue === 5n * 10n ** 22n && compute <= 2n * 10n ** 22n, 'The sponsored demo uses a fixed small testnet budget');
      this.demo_jobs_today += 1;
    }
    const now = near.blockTimestamp();
    const job: Job = {
      id: job_id, title, buyer_id: buyer, provider_id: build.provider_id,
      build_hash, manifest_hash: build.manifest_hash, verifier_hash: this.verifier_hash,
      input_commitment, profile: job_id, budget, compute_remaining: compute.toString(), storage_deposit: storage.toString(),
      compute_refund_amount: '0', compute_refund_state: 'none',
      state: 'funded', outcome: null, settlement: 'pending', settlement_amount: '0', settlement_recipient: '',
      created_at: now.toString(), deadline: (now + BigInt(deadline_seconds) * 1_000_000_000n).toString(),
      settled_at: null, agent_request_id: null, verifier_request_id: null,
      agent_transaction_hash: null, verifier_transaction_hash: null,
      result_commitment: null, result_ciphertext: null, checks: [], reason: null,
    };
    save(`job:${job_id}`, job);
    save(`compute_unit:${job_id}`, (compute / 2n).toString());
    save(`job_index:${this.job_count++}`, job_id);
    event('job_funded', { job_id, build_hash, verifier_hash: job.verifier_hash, budget, input_commitment, deadline: job.deadline });
    return job;
  }

  @call({})
  execute_job({ job_id }: { job_id: string }) {
    const job = this.job(job_id);
    assert(near.predecessorAccountId() === job.buyer_id || near.predecessorAccountId() === job.provider_id, 'Only the buyer or hired provider may begin this job');
    assert(job.state === 'funded', 'Job execution has already begun');
    assert(near.blockTimestamp() < BigInt(job.deadline), 'Job deadline has passed');
    const input = { job_id: job.id, input_commitment: job.input_commitment, agent_manifest_hash: job.manifest_hash };
    const payment = BigInt(json<string>(`compute_unit:${job.id}`)!);
    job.compute_remaining = (BigInt(job.compute_remaining) - payment).toString();
    job.state = 'agent_running';
    save(`job:${job.id}`, job);
    event('agent_started', { job_id, build_hash: job.build_hash });
    this.request(job, job.build_hash, input, payment, 'on_agent_result', 180n * TGAS);
  }

  @call({ privateFunction: true })
  on_agent_result({ job_id }: { job_id: string }) {
    this.privateCallback();
    const job = this.job(job_id);
    let raw: string;
    try { raw = near.promiseResult(0 as never); } catch { return this.admissionFailed(job, 'agent'); }
    if (job.state !== 'agent_running') return job;
    if (near.blockTimestamp() >= BigInt(job.deadline)) return this.finish(job, 'timed_out', 'deadline_passed');
    let output: Record<string, unknown>;
    try { output = JSON.parse(raw); } catch { return this.finish(job, 'execution_error', 'agent_execution_failed'); }
    if (!output || output.schema !== 'sealwork.agent-output.v1' || output.job_id !== job.id || output.input_commitment !== job.input_commitment || output.manifest_hash !== job.manifest_hash || typeof output.sealed_result !== 'string' || output.sealed_result.length > 32000 || !hash(output.result_commitment as string) || !executionReference(output)) {
      return this.finish(job, 'execution_error', 'agent_envelope_invalid');
    }
    job.agent_request_id = typeof output.request_id === 'string' ? output.request_id : null;
    job.agent_transaction_hash = typeof output.transaction_hash === 'string' ? output.transaction_hash : null;
    job.result_commitment = output.result_commitment as string;
    job.state = 'verifier_running';
    const payment = BigInt(json<string>(`compute_unit:${job.id}`)!);
    assert(BigInt(job.compute_remaining) >= payment, 'Verifier compute remains reserved');
    job.compute_remaining = (BigInt(job.compute_remaining) - payment).toString();
    save(`job:${job.id}`, job);
    event('verification_started', { job_id, verifier_hash: job.verifier_hash, agent_request_id: job.agent_request_id });
    this.request(job, job.verifier_hash, {
      job_id: job.id, input_commitment: job.input_commitment, agent_manifest_hash: job.manifest_hash,
      result_commitment: job.result_commitment, sealed_result: output.sealed_result,
    }, payment, 'on_verifier_result', 65n * TGAS);
  }

  @call({ privateFunction: true })
  on_verifier_result({ job_id }: { job_id: string }) {
    this.privateCallback();
    const job = this.job(job_id);
    let raw: string;
    try { raw = near.promiseResult(0 as never); } catch { return this.admissionFailed(job, 'verifier'); }
    if (job.state !== 'verifier_running') return job;
    if (near.blockTimestamp() >= BigInt(job.deadline)) return this.finish(job, 'timed_out', 'deadline_passed');
    let output: Record<string, unknown>;
    try { output = JSON.parse(raw); } catch { return this.finish(job, 'execution_error', 'verifier_execution_failed'); }
    if (!output || output.schema !== 'sealwork.verification.v1' || output.job_id !== job.id || output.input_commitment !== job.input_commitment || output.agent_manifest_hash !== job.manifest_hash || output.verifier_manifest_hash !== this.verifier_manifest_hash || output.result_commitment !== job.result_commitment || !executionReference(output) || typeof output.result_ciphertext !== 'string' || output.result_ciphertext.length > 12000 || typeof output.accepted !== 'boolean' || !Array.isArray(output.checks)) {
      return this.finish(job, 'execution_error', 'verifier_envelope_invalid');
    }
    const checks = output.checks as Check[];
    if (checks.length !== CHECK_IDS.length || !checks.every((check, i) => check.id === CHECK_IDS[i] && typeof check.passed === 'boolean') || output.accepted !== checks.every(check => check.passed)) {
      return this.finish(job, 'execution_error', 'verifier_checks_invalid');
    }
    job.verifier_request_id = typeof output.request_id === 'string' ? output.request_id : null;
    job.verifier_transaction_hash = typeof output.transaction_hash === 'string' ? output.transaction_hash : null;
    job.result_ciphertext = output.result_ciphertext;
    job.checks = checks;
    return this.finish(job, output.accepted ? 'accepted' : 'rejected', output.accepted ? 'all_checks_passed' : 'acceptance_checks_failed');
  }

  @call({})
  expire_job({ job_id }: { job_id: string }) {
    const job = this.job(job_id);
    assert(job.state !== 'settled', 'The outcome is already permanent');
    assert(near.blockTimestamp() >= BigInt(job.deadline), 'The deadline has not passed');
    return this.finish(job, 'timed_out', 'deadline_passed');
  }

  @call({})
  claim_settlement({ job_id }: { job_id: string }) {
    const job = this.job(job_id);
    assert(job.state === 'settled' && job.settlement === 'claimable', 'No failed settlement remains to claim');
    job.settlement = 'pending';
    save(`job:${job.id}`, job);
    this.sendSettlement(job);
  }

  @call({})
  claim_compute_refund({ job_id }: { job_id: string }) {
    const job = this.job(job_id);
    assert(job.compute_refund_state === 'claimable', 'No failed compute refund remains to claim');
    job.compute_refund_state = 'pending';
    save(`job:${job.id}`, job);
    this.sendComputeRefund(job);
  }

  @call({ privateFunction: true })
  on_compute_refund({ job_id }: { job_id: string }): Job {
    this.privateCallback();
    const job = this.job(job_id);
    if (job.compute_refund_state !== 'pending') return job;
    try { near.promiseResult(0 as never); job.compute_refund_state = 'paid'; }
    catch { job.compute_refund_state = 'claimable'; }
    save(`job:${job.id}`, job);
    return job;
  }

  @call({ privateFunction: true })
  on_settlement({ job_id }: { job_id: string }): Job {
    this.privateCallback();
    const job = this.job(job_id);
    if (job.state !== 'settled' || job.settlement !== 'pending') return job;
    let successful = true;
    try { near.promiseResult(0 as never); } catch { successful = false; }
    if (successful) {
      job.settlement = job.outcome === 'accepted' ? 'paid' : 'refunded';
      if (job.outcome === 'accepted') {
        const build = this.build(job.build_hash);
        build.earned = (BigInt(build.earned) + BigInt(job.budget)).toString();
        save(`build:${build.hash}`, build);
      }
    } else { job.settlement = 'claimable'; }
    save(`job:${job.id}`, job);
    event('payment_settled', { job_id, outcome: job.outcome, settlement: job.settlement, recipient: job.settlement_recipient, amount: job.settlement_amount });
    return job;
  }

  @view({})
  get_job({ job_id }: { job_id: string }): Job | null { return json<Job>(`job:${job_id}`); }

  @view({})
  get_build({ hash: build_hash }: { hash: string }): Build | null { return json<Build>(`build:${build_hash}`); }

  @view({})
  list_builds(): Build[] {
    const result: Build[] = [];
    for (let i = 0; i < this.build_count; i++) result.push(this.build(json<string>(`build_index:${i}`)!));
    return result;
  }

  @view({})
  list_jobs({ limit = 30, before = this.job_count }: { limit?: number; before?: number } = {}): Job[] {
    const result: Job[] = [];
    assert(Number.isInteger(limit) && limit >= 1 && limit <= 100, 'Invalid page size');
    assert(Number.isInteger(before) && before >= 0, 'Invalid cursor');
    for (let i = Math.min(before, this.job_count) - 1; i >= 0 && result.length < limit; i--) result.push(this.job(json<string>(`job_index:${i}`)!));
    return result;
  }

  @view({})
  get_config() {
    return {
      owner_id: this.owner_id, outlayer_contract_id: this.outlayer_contract_id,
      project_id: this.project_id, verifier_hash: this.verifier_hash, verifier_manifest_hash: this.verifier_manifest_hash,
      job_storage_deposit: (JOB_STORAGE_BYTES * near.storageByteCost()).toString(),
      build_storage_deposit: (BUILD_STORAGE_BYTES * near.storageByteCost()).toString(),
      demo_buyer_id: this.demo_buyer_id, demo_daily_limit: this.demo_daily_limit,
      demo_jobs_today: this.demo_day === (near.blockTimestamp() / (86400n * 1_000_000_000n)).toString() ? this.demo_jobs_today : 0,
      job_count: this.job_count, build_count: this.build_count,
    };
  }

  private job(id: string): Job {
    const job = json<Job>(`job:${id}`);
    assert(job !== null, 'Unknown job');
    return job;
  }

  private build(id: string): Build {
    const build = json<Build>(`build:${id}`);
    assert(build !== null, 'Unknown build');
    return build;
  }

  private privateCallback(): void {
    assert(near.predecessorAccountId() === near.currentAccountId(), 'Only the contract can receive a promise callback');
    assert(near.promiseResultsCount() === 1n, 'Exactly one authenticated promise result is required');
  }

  private admissionFailed(job: Job, phase: 'agent' | 'verifier'): Job | void {
    // A failed NEAR function-call receipt returns its attached deposit to
    // this contract. An admitted execution instead returns unused compute
    // directly to its payer through OutLayer. Keep those two cases distinct.
    const marker = `admission_returned:${job.id}:${phase}`;
    if (json<boolean>(marker)) return job;
    const running = phase === 'agent' ? 'agent_running' : 'verifier_running';
    if (job.state !== running && job.state !== 'settled') return job;
    save(marker, true);
    const returned = BigInt(json<string>(`compute_unit:${job.id}`)!);
    if (job.state === running) {
      job.compute_remaining = (BigInt(job.compute_remaining) + returned).toString();
      const late = near.blockTimestamp() >= BigInt(job.deadline);
      return this.finish(job, late ? 'timed_out' : 'execution_error', late ? 'deadline_passed' : `${phase}_admission_failed`);
    }
    // If a permissionless expiry won the race, the budget has already been
    // returned. Pay this separate late compute refund once, without changing
    // the permanent outcome or replacing an in-flight budget settlement.
    job.compute_refund_amount = (BigInt(job.compute_refund_amount) + returned).toString();
    job.compute_refund_state = 'pending';
    save(`job:${job.id}`, job);
    this.sendComputeRefund(job);
  }

  private request(job: Job, wasm_hash: string, input: unknown, payment: bigint, callback: string, gas: bigint): void {
    const request = near.promiseBatchCreate(this.outlayer_contract_id);
    near.promiseBatchActionFunctionCall(request, 'request_execution', JSON.stringify({
      source: { Project: { project_id: this.project_id, version_key: wasm_hash } },
      resource_limits: { max_instructions: 1_000_000_000, max_memory_mb: 128, max_execution_seconds: 60 },
      input_data: JSON.stringify(input), secrets_ref: { profile: job.profile, account_id: job.buyer_id },
      response_format: 'Json', payer_account_id: job.buyer_id,
    }), payment, 100n * TGAS);
    const promise = near.promiseThen(request, near.currentAccountId(), callback, JSON.stringify({ job_id: job.id }), 0n, gas);
    near.promiseReturn(promise);
  }

  private finish(job: Job, outcome: Outcome, reason: string): void {
    // Keep the payout promise as the returned transaction result. Returning
    // a Job here would make near-sdk-js replace promise_return with value_return
    // before the payout callback has confirmed its transfer.
    assert(job.state !== 'settled', 'A permanent outcome cannot be replaced');
    const build = this.build(job.build_hash);
    if (outcome === 'accepted') build.accepted += 1;
    else if (outcome === 'rejected') build.rejected += 1;
    else if (outcome === 'timed_out') build.timed_out += 1;
    else build.execution_errors += 1;
    save(`build:${build.hash}`, build);
    job.state = 'settled';
    job.outcome = outcome;
    job.reason = reason;
    job.settled_at = near.blockTimestamp().toString();
    job.settlement_recipient = outcome === 'accepted' ? job.provider_id : job.buyer_id;
    job.settlement_amount = (BigInt(job.budget) + BigInt(job.compute_remaining)).toString();
    job.compute_remaining = '0';
    job.settlement = 'pending';
    save(`job:${job.id}`, job);
    event('outcome_recorded', { job_id: job.id, build_hash: job.build_hash, verifier_hash: job.verifier_hash, input_commitment: job.input_commitment, result_commitment: job.result_commitment, outcome, reason, checks: job.checks });
    this.sendSettlement(job);
  }

  private sendSettlement(job: Job): void {
    const payment = near.promiseBatchCreate(job.settlement_recipient);
    near.promiseBatchActionTransfer(payment, BigInt(job.settlement_amount));
    const callback = near.promiseThen(payment, near.currentAccountId(), 'on_settlement', JSON.stringify({ job_id: job.id }), 0n, 30n * TGAS);
    near.promiseReturn(callback);
  }

  private sendComputeRefund(job: Job): void {
    const refund = near.promiseBatchCreate(job.buyer_id);
    near.promiseBatchActionTransfer(refund, BigInt(job.compute_refund_amount));
    const callback = near.promiseThen(refund, near.currentAccountId(), 'on_compute_refund', JSON.stringify({ job_id: job.id }), 0n, 12n * TGAS);
    near.promiseReturn(callback);
  }
}
