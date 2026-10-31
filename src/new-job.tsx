import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Fingerprint,
  FileText,
  Lock,
  Loader2,
  ShieldCheck,
  Upload,
  Clock,
  Sparkles,
} from "lucide-react";
import { CHECKS, LEDGER_SAMPLE, SOURCE_SAMPLE } from "../shared/types";
import type { HiringPlan, Job, PrivateInput, PrivatePacket } from "../shared/types";
import { inputCommitment, randomHex, sealToKeystore } from "../shared/crypto";
import { inspectInputs } from "../shared/inputs";
import { nearAmount, shortHash } from "../shared/format";
import { AgentAvatar, PageHeading, Pill } from "./components";
import { ApiError, post, privateSession, savePrivate, useData } from "./data";

export function NewJob() {
  const { config, builds, refresh } = useData();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [hash, setHash] = useState(
    params.get("build") ||
      builds.find((build) => build.version === "1.0")?.hash ||
      "",
  );
  const [title, setTitle] = useState("Invoice reconciliation");
  const [source, setSource] = useState(SOURCE_SAMPLE);
  const [ledger, setLedger] = useState(LEDGER_SAMPLE);
  const [agreed, setAgreed] = useState(false);
  const [timeout, setTimeout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("sample");
  const [autonomous, setAutonomous] = useState(params.get("mode") === "agent");
  const [priority, setPriority] = useState<"proven" | "balanced">("proven");
  const [plan, setPlan] = useState<HiringPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const sourceUpload = useRef<HTMLInputElement>(null);
  const ledgerUpload = useRef<HTMLInputElement>(null);
  const selected = builds.find((build) => build.hash === hash) || builds[0];
  const planReady = Boolean(plan && plan.build_hash === selected?.hash && plan.expires_at > Date.now());
  let counts: { invoices: number; payments: number } | null = null;
  let preflight = "";
  try {
    counts = inspectInputs(source, ledger);
  } catch (error) {
    preflight =
      error instanceof Error ? error.message : "Check the CSV format.";
  }
  async function upload(
    event: ChangeEvent<HTMLInputElement>,
    kind: "source" | "ledger",
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10000) {
      setError("Each demo CSV must be below 10 KB.");
      event.target.value = "";
      return;
    }
    const text = await file.text();
    if (kind === "source") setSource(text);
    else setLedger(text);
    setMode("custom");
    setError("");
    event.target.value = "";
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!config?.ready || !config.create_challenge || !selected) {
      setError(
        config?.status_message ||
          "The sponsored demo is not ready. Refresh the workspace shortly.",
      );
      return;
    }
    if (!agreed) {
      setError(
        "Agree to the selected build and acceptance checks before funding the job.",
      );
      return;
    }
    if (preflight) {
      setError(preflight);
      return;
    }
    if (autonomous && !planReady) {
      setError("Let the hiring agent choose a worker before approving the job.");
      return;
    }
    setBusy(true);
    let id = "";
    try {
      setPhase("Encrypting your files locally…");
      id = autonomous && plan ? plan.job_id : `sw_${randomHex(16)}`;
      const input: PrivateInput = {
        job_id: id,
        source_csv: source,
        ledger_csv: ledger,
        buyer_key: randomHex(),
        salt: randomHex(),
      };
      const commitment = inputCommitment(input);
      const packet: PrivatePacket = { input, input_commitment: commitment };
      const encrypted = sealToKeystore(
        JSON.stringify({ SEALWORK_INPUT: JSON.stringify(packet) }),
        config.encryption_public_key,
      );
      savePrivate({
        job_id: id,
        buyer_key: input.buyer_key,
        salt: input.salt,
        input_commitment: commitment,
        hiring_plan: autonomous && plan ? plan : undefined,
      });
      setPhase("Funding escrow & storing the encrypted packet…");
      const response = await post<{
        job: Job;
        capability: string;
        transaction_hash: string;
      }>("/api/jobs", {
        job_id: id,
        title: title.trim(),
        build_hash: selected.hash,
        input_commitment: commitment,
        encrypted_input: encrypted,
        challenge: config.create_challenge,
        scenario: timeout ? "timeout" : "normal",
        hiring_permit: autonomous ? plan?.permit : undefined,
      });
      savePrivate({
        job_id: id,
        buyer_key: input.buyer_key,
        salt: input.salt,
        input_commitment: commitment,
        capability: response.capability,
        transaction_hash: response.transaction_hash,
        hiring_plan: autonomous && plan ? plan : undefined,
      });
      void refresh();
      navigate(`/jobs/${id}`, {
        state: { job: response.job, autorun: !timeout, timeout },
      });
    } catch (error) {
      if (error instanceof ApiError && error.details.job_id === id) {
        const saved = privateSession(id);
        if (saved && typeof error.details.capability === "string")
          savePrivate({ ...saved, capability: error.details.capability });
        navigate(`/jobs/${id}`, { state: { warning: error.message } });
      } else
        setError(
          error instanceof Error
            ? error.message
            : "The job could not be created.",
        );
      void refresh();
    } finally {
      setBusy(false);
    }
  }
  async function chooseWorker() {
    if (!config?.create_challenge) return;
    setPlanning(true);
    setError("");
    setPlan(null);
    setAgreed(false);
    try {
      const value = await post<{ plan: HiringPlan }>("/api/plan", {
        job_id: `sw_${randomHex(16)}`, priority, challenge: config.create_challenge,
      });
      if (!builds.some(b => b.hash === value.plan.build_hash) || value.plan.budget !== config.budget)
        throw new Error("The recommendation did not match the reviewed job agreement.");
      setHash(value.plan.build_hash);
      setPlan(value.plan);
    } catch (error) {
      setError(error instanceof Error ? error.message : "The hiring agent could not complete. No job was funded.");
    } finally { setPlanning(false); }
  }
  return (
    <>
      <Link to="/workspace" className="back-link">
        <ArrowLeft size={14} />
        Back to workspace
      </Link>
      <PageHeading
        eyebrow="A CLEAR AGREEMENT, BEFORE WORK STARTS"
        title={autonomous ? "Let your agent hire safely." : "Create a private job."}
        description={autonomous ? "Set the constraints. AI selects a worker. Independent checks control the payment." : "Choose the exact build, add your files, and agree on what a correct delivery means."}
      />
      <form className="new-job-grid" onSubmit={(event) => void submit(event)}>
        <div className="job-form-main">
          <section className="surface form-section">
            <div className="form-section-heading">
              <span className="step-number">1</span>
              <div>
                <h2>Choose your agent build</h2>
                <p>A fingerprint binds the job to the code you select.</p>
              </div>
            </div>
            <label className="hiring-mode">
              <input type="checkbox" checked={autonomous} onChange={event => {
                setAutonomous(event.target.checked); setPlan(null); setAgreed(false); setTimeout(false);
              }} />
              <Sparkles size={17} /> Let the AI hiring agent choose
            </label>
            {autonomous ? (
              <div className="hiring-agent-panel">
                <p>It compares public build histories. Your files and payment keys are never sent to the planning model.</p>
                <label className="field-label" htmlFor="hiring-priority">Hiring priority</label>
                <select id="hiring-priority" className="text-input" value={priority} onChange={event => {
                  setPriority(event.target.value as "proven" | "balanced"); setPlan(null); setAgreed(false);
                }} disabled={planning}>
                  <option value="proven">Require a previously accepted build</option>
                  <option value="balanced">Consider reviewed builds with no failures</option>
                </select>
                <div className="hiring-constraints"><span>0.050 NEAR maximum</span><span>6 mandatory checks</span><span>Recipient fixed</span></div>
                <button type="button" className="button secondary full" disabled={planning || busy || !config?.planner?.ready || !config?.ready} onClick={() => void chooseWorker()}>
                  {planning ? <><Loader2 size={15} className="spin" />Comparing build records…</> : <><Sparkles size={15} />Choose a worker within my rules</>}
                </button>
                {!config?.planner?.ready && <p className="muted">AI hiring is awaiting its inference configuration. You can switch to manual selection to run a private job.</p>}
                {plan && <div className="hiring-recommendation" role="status">
                  <div><AgentAvatar id={selected.agent_id} /><strong>{selected.name} v{selected.version}</strong><Pill tone="green">Policy checked</Pill></div>
                  <p>{plan.rationale}</p>
                  <Link to={`/builds/${plan.build_hash}`} className="text-link">Inspect this exact build <ArrowRight size={13} /></Link>
                </div>}
              </div>
            ) : <div className="build-select-list">
              {builds.map((build) => (
                <label
                  key={build.hash}
                  className={`build-option ${selected?.hash === build.hash ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="agent_build"
                    value={build.hash}
                    checked={selected?.hash === build.hash}
                    onChange={() => { setHash(build.hash); setPlan(null); setAgreed(false); }}
                  />
                  <AgentAvatar id={build.agent_id} />
                  <div>
                    <strong>
                      {build.name} <span>v{build.version}</span>
                    </strong>
                    <small>
                      {build.version === "1.1"
                        ? "Deliberately faulty update for the rejection demo"
                        : "Deterministic invoice reconciliation specialist"}
                    </small>
                    <code>{shortHash(build.hash, 7)}</code>
                  </div>
                  <span className="radio-mark">
                    {selected?.hash === build.hash && <span />}
                  </span>
                </label>
              ))}
            </div>}
          </section>
          <section className="surface form-section">
            <div className="form-section-heading">
              <span className="step-number">2</span>
              <div>
                <h2>Add the confidential files</h2>
                <p>
                  File contents are encrypted in your browser before upload.
                </p>
              </div>
              <Lock size={19} className="green-text" />
            </div>
            <label className="field-label" htmlFor="job-title">
              Job name <span>Public onchain label</span>
            </label>
            <input
              className="text-input"
              id="job-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              minLength={3}
              maxLength={120}
              required
            />
            <p className="field-hint">
              Keep private details out of this public label.
            </p>
            <div className="input-mode-bar">
              <div className="tabs small">
                <button
                  type="button"
                  className={mode === "sample" ? "active" : ""}
                  onClick={() => {
                    setSource(SOURCE_SAMPLE);
                    setLedger(LEDGER_SAMPLE);
                    setMode("sample");
                    setError("");
                  }}
                >
                  Use sample files
                </button>
                <button
                  type="button"
                  className={mode === "custom" ? "active" : ""}
                  onClick={() => setMode("custom")}
                >
                  Bring your own
                </button>
              </div>
              <span>CSV · Up to 16 rows per file</span>
            </div>
            <div className="csv-input-card">
              <div>
                <span>
                  <FileText size={15} />
                  invoices.csv
                </span>
                <button
                  type="button"
                  onClick={() => sourceUpload.current?.click()}
                >
                  <Upload size={13} />
                  Import CSV
                </button>
              </div>
              <textarea
                aria-label="Private invoice CSV"
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  setMode("custom");
                }}
                spellCheck={false}
                rows={8}
              />
              <input
                ref={sourceUpload}
                type="file"
                accept=".csv,text/csv"
                hidden
                aria-label="Import private invoice CSV"
                onChange={(event) => void upload(event, "source")}
              />
            </div>
            <div className="csv-input-card">
              <div>
                <span>
                  <FileText size={15} />
                  payments.csv
                </span>
                <button
                  type="button"
                  onClick={() => ledgerUpload.current?.click()}
                >
                  <Upload size={13} />
                  Import CSV
                </button>
              </div>
              <textarea
                aria-label="Private payment ledger CSV"
                value={ledger}
                onChange={(event) => {
                  setLedger(event.target.value);
                  setMode("custom");
                }}
                spellCheck={false}
                rows={7}
              />
              <input
                ref={ledgerUpload}
                type="file"
                accept=".csv,text/csv"
                hidden
                aria-label="Import private ledger CSV"
                onChange={(event) => void upload(event, "ledger")}
              />
            </div>
            {counts ? (
              <div className="input-summary">
                <Check size={14} />
                {counts.invoices} invoices · {counts.payments} payment records ·
                ready to encrypt
              </div>
            ) : (
              <div className="input-validation" role="status">
                {preflight}
              </div>
            )}
          </section>
          <section className="surface form-section">
            <div className="form-section-heading">
              <span className="step-number">3</span>
              <div>
                <h2>Agree on the acceptance checks</h2>
                <p>
                  The separate verifier must pass every rule before payment.
                </p>
              </div>
              <ShieldCheck size={20} className="green-text" />
            </div>
            <div className="agreed-checks">
              {CHECKS.map((check) => (
                <div key={check.id}>
                  <span>
                    <Check size={13} />
                  </span>
                  <div>
                    <strong>{check.label}</strong>
                    <p>{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <label className="agreement-checkbox">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
              />
              <span>I agree to these checks and the selected agent build.</span>
            </label>
          </section>
        </div>
        <aside className="job-summary">
          <div className="surface job-summary-card">
            <div className="summary-heading">
              <ShieldCheck size={20} />
              <h2>Your job agreement</h2>
            </div>
            {selected && (
              <div className="summary-agent">
                <AgentAvatar id={selected.agent_id} />
                <div>
                  <strong>{selected.name}</strong>
                  <span>Version {selected.version}</span>
                </div>
                <Pill tone={selected.version === "1.1" ? "amber" : "green"}>
                  {selected.version === "1.1" ? "Faulty demo" : "Exact build"}
                </Pill>
              </div>
            )}
            <dl className="agreement-summary">
              <div>
                <dt>Workflow</dt>
                <dd>Invoice reconciliation</dd>
              </div>
              <div>
                <dt>Acceptance</dt>
                <dd>All 6 checks pass</dd>
              </div>
              <div>
                <dt>Payment deadline</dt>
                <dd>{timeout ? "10 seconds · demo" : "3 minutes"}</dd>
              </div>
              <div>
                <dt>Private files</dt>
                <dd>
                  {counts ? `${counts.invoices} invoices` : "Check inputs"}
                </dd>
              </div>
            </dl>
            <div className="summary-budget">
              <span>Agent budget</span>
              <strong>
                {nearAmount(config?.budget || "50000000000000000000000")}{" "}
                <small>NEAR</small>
              </strong>
              <p>Paid for accepted work. Refunded if rejected or expired.</p>
            </div>
            <div className="sponsor-note">
              <span className="live-dot" />
              <div>
                <strong>Sponsored NEAR testnet</strong>
                <p>
                  The demo wallet covers the budget, storage, and execution
                  allowance. You pay nothing to try.
                </p>
              </div>
            </div>
            {!autonomous && <label className="timeout-option">
              <input
                type="checkbox"
                checked={timeout}
                onChange={(event) => setTimeout(event.target.checked)}
              />
              <div>
                <strong>Test a missed deadline</strong>
                <span>
                  Fund the job, skip execution, and request a refund after 10
                  seconds.
                </span>
              </div>
              <Clock size={15} />
            </label>}
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            {config?.status_message && !config.ready && (
              <div className="form-status" role="status">
                {config.status_message}
              </div>
            )}
            <button
              type="submit"
              disabled={busy || planning || !config?.ready || !agreed || Boolean(preflight) || (autonomous && !planReady)}
              className="button primary full create-job-button"
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="spin" />
                  {phase}
                </>
              ) : (
                <>
                  {autonomous ? "Approve rules & let the agent hire" : "Encrypt & fund the job"} <ArrowRight size={17} />
                </>
              )}
            </button>
            <p className="summary-private-note">
              <Lock size={12} />
              Your delivery key stays in this browser session. Save a recovery
              file from the job page to reopen the result later.
            </p>
          </div>
          <div className="summary-fingerprint-note">
            <Fingerprint size={17} />
            <p>
              A new build gets a new history.
              <br />
              You hire the fingerprint, not just the name.
            </p>
          </div>
        </aside>
      </form>
    </>
  );
}
