import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Fingerprint,
  Loader2,
  Lock,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import type { AttestationSummary, Job, PrivateResult } from "../shared/types";
import { CHECKS } from "../shared/types";
import { hex, openResult, resultCommitment } from "../shared/crypto";
import {
  accountUrl,
  dateFromNs,
  formatDate,
  nearAmount,
  shortHash,
  transactionUrl,
} from "../shared/format";
import {
  AgentAvatar,
  CopyValue,
  Empty,
  JobsTable,
  Loading,
  PageHeading,
  Pill,
  Status,
} from "./components";
import {
  api,
  downloadJson,
  post,
  privateSession,
  savePrivate,
  SOURCE_URL,
  useData,
} from "./data";
import type { PrivateSession } from "./data";

export function JobDetail() {
  const { id = "" } = useParams();
  const location = useLocation();
  const { jobs, builds, refresh, toast, config } = useData();
  const routeState = location.state as {
    job?: Job;
    autorun?: boolean;
    timeout?: boolean;
    warning?: string;
  } | null;
  const [job, setJob] = useState<Job | null>(
    jobs.find((job) => job.id === id) || routeState?.job || null,
  );
  const [error, setError] = useState(routeState?.warning || "");
  const [busy, setBusy] = useState(false);
  const [own, setOwn] = useState<PrivateSession | null>(() =>
    privateSession(id),
  );
  const [result, setResult] = useState<PrivateResult | null>(null);
  const [deliveryError, setDeliveryError] = useState("");
  const [now, setNow] = useState(Date.now());
  const autoStarted = useRef(false);
  const restoreInput = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    try {
      const value = await api<{ job: Job }>(
        `/api/jobs?id=${encodeURIComponent(id)}`,
      );
      setJob(value.job);
    } catch (error) {
      if (!job)
        setError(
          error instanceof Error
            ? error.message
            : "The job could not be loaded.",
        );
    }
  }, [id, Boolean(job)]);
  useEffect(() => {
    setOwn(privateSession(id));
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [id, load]);
  useEffect(() => {
    const update = () => setOwn(privateSession(id));
    window.addEventListener("sealwork-private-updated", update);
    return () => window.removeEventListener("sealwork-private-updated", update);
  }, [id]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function control(action: string) {
    setBusy(true);
    setError("");
    if (action === "execute" && own) {
      savePrivate({ ...own, started: true });
    }
    try {
      const value = await post<{ job: Job; transaction_hash?: string }>(
        "/api/control",
        { job_id: id, action, capability: own?.capability },
      );
      setJob(value.job);
      if (own && value.transaction_hash)
        savePrivate({
          ...own,
          started: true,
          transaction_hash: value.transaction_hash,
        });
      void refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The action could not complete.",
      );
      void load();
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      routeState?.autorun &&
      job?.state === "funded" &&
      own?.capability &&
      !own.started &&
      !privateSession(id)?.started &&
      !autoStarted.current
    ) {
      autoStarted.current = true;
      void control("execute");
    }
  }, [job?.state, own?.capability, own?.started]);
  useEffect(() => {
    let active = true;
    setResult(null);
    setDeliveryError("");
    if (!job?.result_ciphertext || !own) return;
    void openResult(
      job.result_ciphertext,
      own.buyer_key,
      id,
      job.input_commitment,
    )
      .then((opened) => {
        if (resultCommitment(opened.bytes, own.salt) !== job.result_commitment)
          throw new Error(
            "The decrypted delivery does not match the recorded result commitment.",
          );
        if (active) setResult(opened.result);
      })
      .catch(() => {
        if (active)
          setDeliveryError(
            "This delivery cannot be opened with the saved key, or its bytes do not match the recorded result. Import the correct recovery file.",
          );
      });
    return () => {
      active = false;
    };
  }, [
    job?.result_ciphertext,
    job?.result_commitment,
    own?.buyer_key,
    own?.salt,
    id,
  ]);
  async function restore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !job) return;
    try {
      if (file.size > 5000)
        throw new Error(
          "Choose the small JSON recovery file saved for this job.",
        );
      const value = JSON.parse(await file.text()) as PrivateSession;
      if (
        value.job_id !== id ||
        value.input_commitment !== job.input_commitment ||
        !/^[a-f0-9]{64}$/.test(value.buyer_key) ||
        !/^[a-f0-9]{64}$/.test(value.salt)
      )
        throw new Error(
          "This recovery file belongs to a different job or has an invalid key.",
        );
      savePrivate(value);
      toast("Private delivery key restored in this browser session.");
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "The recovery file could not be read.",
      );
    }
    event.target.value = "";
  }
  function exportCsv() {
    if (!result) return;
    const safe = (value: string) =>
      `"${(/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replace(/"/g, '""')}"`;
    const lines = [
      "invoice_id,vendor,amount,currency,status",
      ...result.rows.map((row) => {
        const minor = BigInt(row.amount_minor);
        const amount = `${minor / 100n}.${(minor % 100n).toString().padStart(2, "0")}`;
        return [
          safe(row.invoice_id),
          safe(row.vendor),
          amount,
          safe(row.currency),
          safe(row.status),
        ].join(",");
      }),
    ];
    const blob = new Blob([lines.join("\r\n") + "\r\n"], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${id}-reconciliation.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!job)
    return (
      <>
        <PageHeading
          title="Loading the work receipt…"
          description="Reading this job from the deployed NEAR contract."
        />
        {error ? (
          <div className="surface">
            <Empty
              title="Receipt not available"
              description={error}
              action={
                <button
                  className="button secondary"
                  onClick={() => void load()}
                >
                  Try again
                </button>
              }
            />
          </div>
        ) : (
          <Loading />
        )}
      </>
    );
  const build = builds.find((build) => build.hash === job.build_hash);
  const elapsed = now >= dateFromNs(job.deadline).getTime();
  const seconds = Math.max(
    0,
    Math.ceil((dateFromNs(job.deadline).getTime() - now) / 1000),
  );
  const terminal = job.state === "settled";
  const title =
    job.outcome === "accepted"
      ? "The work passed. The evidence stays."
      : job.outcome === "rejected"
        ? "The checks caught the changed result."
        : job.outcome === "timed_out"
          ? "The deadline passed. The budget returns."
          : job.outcome === "execution_error"
            ? "Execution stopped. The budget is protected."
            : "Your private job is in motion.";
  const timeline = [
    {
      label: "Escrow funded",
      detail: `${nearAmount(job.budget)} NEAR reserved`,
      done: true,
    },
    {
      label: "Agent execution",
      detail: `${build?.name || "Agent"} v${build?.version || "—"}`,
      done: Boolean(job.agent_request_id || job.agent_transaction_hash),
      active: job.state === "agent_running",
    },
    {
      label: "Independent verification",
      detail: "Six agreed acceptance checks",
      done: Boolean(job.verifier_request_id || job.verifier_transaction_hash),
      active: job.state === "verifier_running",
    },
    {
      label:
        job.outcome === "accepted" ? "Payment released" : "Escrow settlement",
      detail: terminal
        ? job.settlement === "claimable"
          ? "Payout awaits a retry"
          : job.settlement === "paid"
            ? "Paid to the hired provider"
            : job.settlement === "refunded"
              ? "Refunded to the buyer"
              : "Settlement pending"
        : "After the outcome is recorded",
      done: job.settlement === "paid" || job.settlement === "refunded",
      active: terminal && job.settlement === "pending",
    },
  ];
  return (
    <>
      <Link className="back-link" to="/receipts">
        <ArrowLeft size={14} />
        All work receipts
      </Link>
      <div className="job-detail-heading">
        <div>
          <p className="eyebrow">
            WORK RECEIPT <span>{id.slice(-8).toUpperCase()}</span>
          </p>
          <h1>{job.title}</h1>
          <p>{title}</p>
        </div>
        <div>
          <Status job={job} />
          <button
            className="button secondary small"
            onClick={() =>
              downloadJson(`${id}-public-receipt.json`, {
                standard: "sealwork.work-receipt.v1",
                network: "NEAR testnet",
                contract_id: job.contract_id || config?.contract_id,
                job,
              })
            }
          >
            <Download size={14} />
            Export receipt
          </button>
        </div>
      </div>
      {own?.hiring_plan && own.hiring_plan.job_id === id && own.hiring_plan.build_hash === job.build_hash && (
        <section className="surface hiring-receipt">
          <div className="section-heading"><h2>Your agent's hiring decision</h2><Pill tone="green">Public records only</Pill></div>
          <p>{own.hiring_plan.rationale}</p>
          <p className="muted">The planning model chose this exact build within the fixed budget. It received no financial files or payment keys. The independent verifier determined the outcome.</p>
        </section>
      )}
      <div className="job-detail-grid">
        <div>
          <section className="surface execution-progress">
            <div className="section-heading">
              <h2>One job. A complete trail.</h2>
              <span className="muted">
                <Lock size={12} />
                Private files
              </span>
            </div>
            <div className="job-timeline">
              {timeline.map((step, index) => (
                <div
                  key={index}
                  className={`timeline-step ${step.done ? "done" : ""} ${step.active ? "current" : ""}`}
                >
                  <span className="timeline-dot">
                    {step.done ? (
                      <Check size={14} />
                    ) : step.active ? (
                      <Loader2 size={13} className="spin" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <div>
                    <strong>{step.label}</strong>
                    <p>{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            {!terminal && (
              <div className="execution-message">
                <span className="live-dot" />
                <p>
                  {job.state === "agent_running"
                    ? "The selected agent is processing your encrypted files."
                    : job.state === "verifier_running"
                      ? "The independent verifier is recomputing the acceptance checks."
                      : busy
                        ? "Submitting the execution request…"
                        : routeState?.timeout
                          ? "This demo job is waiting for its deadline. Request a refund when the countdown reaches zero."
                          : "The escrow is funded. Start the selected agent before the deadline."}
                </p>
              </div>
            )}
          </section>
          <section className="surface acceptance-panel">
            <div className="section-heading">
              <div>
                <h2>The agreed acceptance checks</h2>
                <p>
                  {job.checks.length
                    ? `${job.checks.filter((check) => check.passed).length} of 6 checks passed`
                    : "Waiting for the independent verifier"}
                </p>
              </div>
              <ShieldCheck size={23} className="green-text" />
            </div>
            {CHECKS.map((check) => {
              const actual = job.checks.find((value) => value.id === check.id);
              return (
                <div
                  className={`receipt-check ${actual ? (actual.passed ? "passed" : "failed") : ""}`}
                  key={check.id}
                >
                  <span>
                    {actual ? (
                      actual.passed ? (
                        <Check size={15} />
                      ) : (
                        <X size={15} />
                      )
                    ) : (
                      <span className="pending-check" />
                    )}
                  </span>
                  <div>
                    <strong>{check.label}</strong>
                    <p>{check.detail}</p>
                  </div>
                  <small>
                    {actual ? (actual.passed ? "Passed" : "Failed") : "Pending"}
                  </small>
                </div>
              );
            })}
            {job.outcome === "rejected" && (
              <div className="rejection-explanation">
                <strong>Acceptance failed. The agent was not paid.</strong>
                <p>
                  The result violated an agreed rule. This failure is recorded
                  only against {build?.name} v{build?.version}.
                  {job.settlement === "refunded"
                    ? " The buyer’s budget has been refunded."
                    : job.settlement === "claimable"
                      ? " The refund transfer needs a retry."
                      : " The refund transfer is pending."}
                </p>
              </div>
            )}
            {job.outcome === "timed_out" && (
              <div className="deadline-explanation">
                <Clock size={18} />
                <p>
                  No accepted delivery arrived before the deadline. The contract
                  recorded a timeout.
                  {job.settlement === "refunded"
                    ? " The budget and unspent reserved compute have been returned."
                    : job.settlement === "claimable"
                      ? " The refund transfer needs a retry."
                      : " The budget refund is pending."}
                </p>
              </div>
            )}
            {job.outcome === "execution_error" && (
              <div className="deadline-explanation">
                <p>
                  The execution did not return a valid bound result. The
                  contract recorded an execution error for this build.
                  {job.settlement === "refunded"
                    ? " The budget has been refunded."
                    : job.settlement === "claimable"
                      ? " The refund transfer needs a retry."
                      : " The budget refund is pending."}
                </p>
              </div>
            )}
          </section>
          <section className="surface delivery-panel">
            <div className="section-heading">
              <div>
                <h2>Your private delivery</h2>
                <p>
                  {result
                    ? "Decrypted locally. Matched to the recorded commitment."
                    : "Only a browser with your delivery key can open the result."}
                </p>
              </div>
              {result && job.outcome === "accepted" && (
                <button className="button secondary small" onClick={exportCsv}>
                  <Download size={14} />
                  Download CSV
                </button>
              )}
            </div>
            {result ? (
              <>
                <div className="delivery-summary">
                  <Pill tone="green">
                    <Lock size={11} />
                    Opened in your browser
                  </Pill>
                  <span>{result.rows.length} reconciled invoices</span>
                  {job.outcome !== "accepted" && (
                    <Pill tone="amber">
                      Rejected delivery · inspection only
                    </Pill>
                  )}
                </div>
                <div className="table-scroll">
                  <table className="delivery-table">
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Vendor</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, index) => (
                        <tr key={`${row.invoice_id}-${index}`}>
                          <td>
                            <code>{row.invoice_id}</code>
                          </td>
                          <td>{row.vendor}</td>
                          <td className="numeric">
                            {
                              (
                                { USD: "$", EUR: "€", GBP: "£" } as Record<
                                  string,
                                  string
                                >
                              )[row.currency]
                            }
                            {(BigInt(row.amount_minor) / 100n).toLocaleString(
                              "en-US",
                            )}
                            .
                            {(BigInt(row.amount_minor) % 100n)
                              .toString()
                              .padStart(2, "0")}{" "}
                            <small>{row.currency}</small>
                          </td>
                          <td>
                            <Pill
                              tone={
                                row.status === "matched"
                                  ? "green"
                                  : row.status === "mismatch"
                                    ? "amber"
                                    : "neutral"
                              }
                            >
                              {row.status}
                            </Pill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="locked-delivery">
                <div>
                  <Lock size={25} />
                </div>
                <h3>
                  {job.result_ciphertext
                    ? "This delivery is encrypted."
                    : "The private delivery will appear here."}
                </h3>
                <p>
                  {deliveryError ||
                    (!own && job.result_ciphertext
                      ? "Import this job’s recovery file to decrypt the result locally. Public visitors can inspect the receipt without seeing your records."
                      : "Your browser keeps the delivery key. Raw file contents do not appear in the public receipt.")}
                </p>
                {job.result_ciphertext && !own && (
                  <button
                    className="button secondary small"
                    onClick={() => restoreInput.current?.click()}
                  >
                    <Upload size={14} />
                    Import recovery file
                  </button>
                )}
              </div>
            )}
            <div className="delivery-recovery-bar">
              <span>
                <Lock size={13} />
                {own
                  ? "Save a recovery file to reopen this result after closing the tab."
                  : "Your private recovery file unlocks only this job’s result."}
              </span>
              {own ? (
                <button
                  onClick={() =>
                    downloadJson(`${id}-PRIVATE-recovery.json`, own)
                  }
                >
                  <Download size={13} />
                  Save recovery file
                </button>
              ) : (
                <button onClick={() => restoreInput.current?.click()}>
                  <Upload size={13} />
                  Import key
                </button>
              )}
              <input
                type="file"
                ref={restoreInput}
                hidden
                accept=".json,application/json"
                aria-label="Import private delivery recovery file"
                onChange={(event) => void restore(event)}
              />
            </div>
          </section>
          <section className="surface proof-panel">
            <div className="section-heading">
              <div>
                <h2>Inspect the execution evidence</h2>
                <p>
                  Separate records for the agent and the acceptance verifier.
                </p>
              </div>
              <Fingerprint size={23} />
            </div>
            <div className="proof-cards">
              <ProofCard job={job} phase="agent" />
              <ProofCard job={job} phase="verifier" />
            </div>
            <p className="proof-note">
              The contract consumes authenticated OutLayer callbacks. Hash
              checks here compare the returned evidence; full hardware quote
              verification is available in OutLayer’s execution dashboard.
            </p>
          </section>
        </div>
        <aside className="receipt-sidebar">
          <section
            className={`surface settlement-card ${job.outcome === "accepted" ? "accepted" : job.outcome === "rejected" ? "rejected" : ""}`}
          >
            <div className="settlement-card-icon">
              {job.outcome === "accepted" ? (
                <ShieldCheck size={25} />
              ) : terminal ? (
                <Clock size={25} />
              ) : (
                <Lock size={25} />
              )}
            </div>
            <p className="eyebrow">
              {job.settlement === "paid"
                ? "PAYMENT RELEASED"
                : job.settlement === "refunded"
                  ? "BUDGET REFUNDED"
                  : "AGREED JOB BUDGET"}
            </p>
            <h2>
              {nearAmount(job.budget)} <span>NEAR</span>
            </h2>
            <p>
              {job.outcome === "accepted"
                ? "The delivered result passed every agreed check."
                : job.outcome === "rejected"
                  ? "The result did not meet the acceptance agreement."
                  : job.outcome === "timed_out"
                    ? "The deadline rule returned the reserved budget."
                    : terminal
                      ? "Execution stopped without an accepted delivery."
                      : "Escrow is reserved until acceptance or expiry."}
            </p>
            <div className="settlement-recipient">
              <span>{job.outcome === "accepted" ? "Provider" : "Buyer"}</span>
              <a
                href={accountUrl(
                  job.outcome === "accepted" ? job.provider_id : job.buyer_id,
                )}
                target="_blank"
                rel="noreferrer"
              >
                {
                  (job.outcome === "accepted"
                    ? job.provider_id
                    : job.buyer_id
                  ).split(".")[0]
                }
                <ArrowUpRight size={13} />
              </a>
            </div>
            {!terminal && (
              <div className="deadline-countdown">
                <Clock size={14} />
                <span>
                  {elapsed
                    ? "Deadline passed"
                    : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} until deadline`}
                </span>
              </div>
            )}
            {!terminal &&
              job.state === "funded" &&
              own?.capability &&
              !elapsed &&
              !routeState?.timeout && (
                <button
                  disabled={busy}
                  className="button primary full"
                  onClick={() => void control("execute")}
                >
                  {busy ? (
                    <Loader2 className="spin" size={15} />
                  ) : (
                    <ArrowRight size={15} />
                  )}
                  Run the selected agent
                </button>
              )}
            {!terminal && elapsed && (
              <button
                disabled={busy}
                className="button primary full"
                onClick={() => void control("expire")}
              >
                {busy ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  <Clock size={15} />
                )}
                Request deadline refund
              </button>
            )}
            {job.settlement === "claimable" && (
              <button
                disabled={busy}
                className="button primary full"
                onClick={() => void control("claim")}
              >
                Retry the fixed-recipient payout
              </button>
            )}
            {job.compute_refund_state === "claimable" && (
              <button
                disabled={busy}
                className="button secondary full"
                onClick={() => void control("claim_compute")}
              >
                Retry unused compute refund
              </button>
            )}
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
          </section>
          <section className="surface receipt-build-card">
            <p className="eyebrow">THE BUILD THAT DID THE WORK</p>
            <div className="receipt-build-name">
              <AgentAvatar id={build?.agent_id || "ledgerline"} />
              <div>
                <h3>{build?.name || "Agent"}</h3>
                <span>Version {build?.version || "—"}</span>
              </div>
            </div>
            <CopyValue value={job.build_hash} />
            <p>
              This outcome belongs to this exact binary. Other versions keep
              their own history.
            </p>
            <Link to={`/builds/${job.build_hash}`} className="text-link">
              View this build’s record <ArrowUpRight size={13} />
            </Link>
          </section>
          <section className="surface receipt-metadata">
            <p className="eyebrow">PUBLIC RECORD</p>
            <dl>
              <div>
                <dt>Network</dt>
                <dd>NEAR testnet</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(job.created_at)}</dd>
              </div>
              <div>
                <dt>Deadline</dt>
                <dd>{formatDate(job.deadline)}</dd>
              </div>
              {job.settled_at && (
                <div>
                  <dt>Outcome recorded</dt>
                  <dd>{formatDate(job.settled_at)}</dd>
                </div>
              )}
              <div>
                <dt>Input commitment</dt>
                <dd>
                  <CopyValue value={job.input_commitment} />
                </dd>
              </div>
              {job.result_commitment && (
                <div>
                  <dt>Result commitment</dt>
                  <dd>
                    <CopyValue value={job.result_commitment} />
                  </dd>
                </div>
              )}
            </dl>
            <a
              href={accountUrl(
                config?.contract_id || "market.sealwork-lab.testnet",
              )}
              target="_blank"
              rel="noreferrer"
              className="text-link"
            >
              Inspect the NEAR contract <ExternalLink size={13} />
            </a>
          </section>
        </aside>
      </div>
    </>
  );
}

function ProofCard({ job, phase }: { job: Job; phase: "agent" | "verifier" }) {
  const request =
    phase === "agent" ? job.agent_request_id : job.verifier_request_id;
  const [evidence, setEvidence] = useState<AttestationSummary | null>(null);
  const transaction = phase === "agent" ? job.agent_transaction_hash : job.verifier_transaction_hash;
  const resolvedRequest = evidence?.request_id || request;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function inspect() {
    setBusy(true);
    setError("");
    try {
      setEvidence(
        await api<AttestationSummary>(
          `/api/attestation?job_id=${job.id}&phase=${phase}`,
        ),
      );
    } catch {
      setError(
        "Evidence is temporarily unavailable. Try the execution dashboard.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article>
      <div className="proof-card-heading">
        <span>
          {phase === "agent" ? (
            <Fingerprint size={17} />
          ) : (
            <ShieldCheck size={17} />
          )}
        </span>
        <strong>
          {phase === "agent" ? "Agent execution" : "Acceptance verifier"}
        </strong>
      </div>
      <div className="proof-hash">
        <span>Executing binary</span>
        <code>
          {shortHash(phase === "agent" ? job.build_hash : job.verifier_hash, 9)}
        </code>
      </div>
      <p>
        {resolvedRequest
          ? `OutLayer request #${resolvedRequest}`
          : transaction ? "Execution linked to its NEAR transaction" : "No execution record returned yet"}
      </p>
      {(request || transaction) && (
        <button
          className="button secondary small full"
          disabled={busy}
          onClick={() => void inspect()}
        >
          {busy ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <Fingerprint size={14} />
          )}
          Inspect attestation
        </button>
      )}
      {evidence && (
        <div className="attestation-result">
          <span className={evidence.wasm_matches ? "green-text" : "amber-text"}>
            {evidence.wasm_matches ? <Check size={13} /> : <Clock size={13} />}{" "}
            {evidence.available
              ? evidence.wasm_matches
                ? "Binary fingerprint matches"
                : "Evidence available; inspect the hash"
              : "Attestation is not available yet"}
          </span>
          {evidence.quote_present && (
            <span>
              <Check size={13} />
              Hardware quote present
            </span>
          )}
          <a href={evidence.url} target="_blank" rel="noreferrer">
            Open the evidence <ExternalLink size={12} />
          </a>
        </div>
      )}
      {error && <p className="proof-error">{error}</p>}
      {(resolvedRequest || transaction) && (
        <a
          className="proof-dashboard"
          href={resolvedRequest ? `https://app.outlayer.ai/executions?network=testnet&request_id=${resolvedRequest}` : transactionUrl(transaction!)}
          target="_blank"
          rel="noreferrer"
        >
          {resolvedRequest ? "OutLayer verification dashboard" : "NEAR execution transaction"} <ArrowUpRight size={12} />
        </a>
      )}
    </article>
  );
}

export function BuildDetail() {
  const { hash = "" } = useParams();
  const { builds, jobs, config } = useData();
  const build = builds.find((build) => build.hash === hash);
  const [verified, setVerified] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const live = Boolean(config?.builds.length);
  async function verifyBinary() {
    if (!build) return;
    setBusy(true);
    setVerified("");
    try {
      const response = await fetch(build.wasm_url);
      if (!response.ok) throw new Error("Download failed");
      const actual = hex(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", await response.arrayBuffer()),
        ),
      );
      setVerified(actual === build.hash ? "matched" : "mismatched");
    } catch {
      setVerified("unavailable");
    } finally {
      setBusy(false);
    }
  }
  if (!build) return <NotFound />;
  const specific = jobs.filter((job) => job.build_hash === hash);
  const attempts =
    build.accepted + build.rejected + build.timed_out + build.execution_errors;
  return (
    <>
      <Link to="/agents" className="back-link">
        <ArrowLeft size={14} />
        All agents & builds
      </Link>
      <div className="build-detail-heading">
        <AgentAvatar id={build.agent_id} size="large" />
        <div>
          <p className="eyebrow">EXACT-BUILD RECORD</p>
          <h1>
            {build.name} <span>v{build.version}</span>
          </h1>
          <p>{build.description}</p>
        </div>
        <Link to={`/new?build=${hash}`} className="button primary">
          Hire this build <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="build-detail-grid">
        <div>
          <section className="surface fingerprint-panel">
            <div className="section-heading">
              <div>
                <h2>This is the identity you hire.</h2>
                <p>The SHA-256 of the exact compiled WebAssembly binary.</p>
              </div>
              <Fingerprint size={24} />
            </div>
            <code className="full-fingerprint">{build.hash}</code>
            <div className="fingerprint-actions">
              <CopyValue value={build.hash} />
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => void verifyBinary()}
              >
                {busy ? (
                  <Loader2 className="spin" size={14} />
                ) : (
                  <ShieldCheck size={14} />
                )}
                Verify binary fingerprint
              </button>
              <a
                className="text-link"
                href={`/manifests/${build.manifest_hash}.json`}
                target="_blank"
                rel="noreferrer"
              >
                Inspect manifest <ArrowUpRight size={13} />
              </a>
            </div>
            {verified && (
              <div
                className={`binary-verdict ${verified === "matched" ? "matched" : "unmatched"}`}
                role="status"
              >
                {verified === "matched" ? (
                  <>
                    <Check size={16} />
                    Downloaded binary matches the recorded fingerprint.
                  </>
                ) : verified === "mismatched" ? (
                  <>
                    <X size={16} />
                    Downloaded bytes do not match this record. Do not hire this
                    download.
                  </>
                ) : (
                  <>The binary could not be downloaded. Try again shortly.</>
                )}
              </div>
            )}
          </section>
          <div className="stats-grid build-stats">
            {[
              { label: "Accepted", value: build.accepted },
              { label: "Rejected", value: build.rejected },
              {
                label: "Expired / errors",
                value: build.timed_out + build.execution_errors,
              },
              {
                label: "Earned",
                value: nearAmount(build.earned),
                unit: "NEAR",
              },
            ].map((item) => (
              <article className="stat-card" key={item.label}>
                <span className="stat-label">{item.label}</span>
                <div className="stat-value">
                  {live ? item.value : "—"}
                  {item.unit && <span>{item.unit}</span>}
                </div>
                <p>
                  {item.label === "Accepted"
                    ? `${live ? attempts : "—"} total outcomes`
                    : "Only this fingerprint"}
                </p>
              </article>
            ))}
          </div>
          <section className="surface">
            <div className="section-heading">
              <div>
                <h2>Work by this exact build</h2>
                <p>
                  Recent public receipts, including rejected and expired work.
                </p>
              </div>
            </div>
            <JobsTable jobs={specific} compact />
          </section>
        </div>
        <aside>
          <section className="surface build-specification">
            <p className="eyebrow">EXECUTION AGREEMENT</p>
            <dl>
              <div>
                <dt>Specialty</dt>
                <dd>Invoice reconciliation</dd>
              </div>
              <div>
                <dt>Engine</dt>
                <dd>Deterministic Rust recipe</dd>
              </div>
              <div>
                <dt>Runtime</dt>
                <dd>OutLayer · WASI Preview 2</dd>
              </div>
              <div>
                <dt>External model</dt>
                <dd>None in this prototype</dd>
              </div>
              <div>
                <dt>Network permission</dt>
                <dd>No external network access</dd>
              </div>
              <div>
                <dt>Private input access</dt>
                <dd>This build + pinned verifier</dd>
              </div>
              <div>
                <dt>Acceptance</dt>
                <dd>All 6 agreed checks</dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>
                  <a
                    href={accountUrl(build.provider_id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {build.provider_id.split(".")[0]}
                    <ArrowUpRight size={12} />
                  </a>
                </dd>
              </div>
            </dl>
            <a
              className="button secondary small full"
              href={`${SOURCE_URL}/tree/main/workers`}
              target="_blank"
              rel="noreferrer"
            >
              Review the source <ExternalLink size={13} />
            </a>
          </section>
          <div className="version-note">
            <Fingerprint size={22} />
            <h3>History belongs to code.</h3>
            <p>
              {build.version === "1.1"
                ? "This intentionally faulty update changes one amount. Run it to see the verifier reject the result and refund escrow."
                : "A new version receives a new fingerprint. This build’s successful outcomes do not become the next version’s record."}
            </p>
            <Link to="/agents" className="text-link">
              Compare versions <ArrowUpRight size={13} />
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}

export function NotFound() {
  return (
    <>
      <PageHeading
        title="This record is not here."
        description="Choose a deployed agent build or a public work receipt from the workspace."
      />
      <Link className="button primary" to="/workspace">
        Open the workspace <ArrowRight size={16} />
      </Link>
    </>
  );
}
