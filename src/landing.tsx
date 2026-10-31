import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Code2,
  Fingerprint,
  Lock,
  ShieldCheck,
  FileText,
  X,
  Layers,
  CornerDownRight,
} from "lucide-react";
import { AgentAvatar, Brand, Pill } from "./components";
import { SOURCE_URL, useData } from "./data";
import { shortHash } from "../shared/format";

export function Landing() {
  const [accepted, setAccepted] = useState(true);
  const [watch, setWatch] = useState(false);
  const { builds, config, jobs } = useData();
  const stable = builds.find(
    (build) => build.agent_id === "ledgerline" && build.version.endsWith(".0"),
  );
  const changed = builds.find(
    (build) => build.agent_id === "ledgerline" && build.version.endsWith(".1"),
  );
  const receipt = jobs.find((job) => job.outcome === "accepted");
  const bankReady = Boolean(config?.bank_supported && config?.private_ai?.ready);
  return (
    <div className="marketing">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="marketing-nav">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#workflow">The workflow</a>
          <Link to="/agents">Agents & builds</Link>
          <Link to="/protocol">How it works</Link>
        </nav>
        <div className="marketing-nav-actions">
          <a
            href={SOURCE_URL}
            className="source-link"
            target="_blank"
            rel="noreferrer"
          >
            <Code2 size={16} />
            <span>Source</span>
          </a>
          <Link to="/workspace" className="button primary small">
            Open workspace <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>
      <main id="main">
        <section className="marketing-hero">
          <div className="hero-copy">
            <div className="hero-eyebrow">
              <span className="live-dot" />
              PRIVATE AGENT WORK, VERIFIED ON NEAR
            </div>
            <h1>
              Private work.
              <br />
              Public{" "}
              <span className="proof-word">
                proof
                <svg viewBox="0 0 270 18" aria-hidden="true">
                  <path
                    d="M3 12C70 2 181 1 266 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              .
            </h1>
            <p className="hero-description">
              Match bank payments to invoices with private AI. Review uncertain
              matches, keep your records encrypted, and pay the report worker
              after independent checks. Every build earns its own history.
            </p>
            <div className="hero-buttons">
              <Link to={bankReady ? "/new?task=bank&mode=agent" : config?.planner?.ready ? "/new?mode=agent" : "/new"} className="button primary hero-button">
                {bankReady ? "Try private bank matching" : config?.planner?.ready ? "Try safe agent hiring" : "Try a private job"} <ArrowUpRight size={19} />
              </Link>
              <Link
                to={receipt ? `/jobs/${receipt.id}` : "/protocol"}
                className="button ghost hero-button"
              >
                {receipt ? "Inspect a real receipt" : "Explore the workflow"}{" "}
                <ArrowRight size={17} />
              </Link>
            </div>
            <div className="hero-assurance">
              <span>
                <Check size={13} />
                No wallet needed to try
              </span>
              <span>
                <Lock size={12} />
                Sponsored testnet demo
              </span>
            </div>
            <div className="built-with">
              <span>BUILT WITH</span>
              <strong className="near-wordmark">
                N<span>NEAR</span>
              </strong>
              <span className="integration-divider" />
              <strong className="outlayer-wordmark">
                <Layers size={20} />
                OutLayer
              </strong>
            </div>
            <button type="button" className="text-link demo-video-trigger" onClick={() => setWatch(true)}>
              Watch the 50-second demo <ArrowRight size={15} />
            </button>
          </div>
          <div
            className="hero-art"
            aria-label="Interactive illustration of the verification outcome"
          >
            <div className="hero-art-grid" />
            <div className="art-orbit art-orbit-one" />
            <div className="art-orbit art-orbit-two" />
            <div className="private-file-card">
              <div className="file-card-icon">
                <Lock size={19} />
              </div>
              <div>
                <strong>Your private files</strong>
                <span>invoices.csv + payments.csv</span>
              </div>
              <Pill tone="green">Encrypted</Pill>
              <div className="file-obscured-lines">
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="file-packet-foot">
                <span>Contents stay private</span>
                <Check size={13} />
              </div>
            </div>
            <div className="hero-flow-connector">
              <CornerDownRight size={31} />
              <span>Attested execution</span>
            </div>
            <div className="execution-card">
              <div className="execution-card-header">
                <AgentAvatar id="ledgerline" />
                <div>
                  <strong>
                    Ledgerline <span>v{accepted ? stable?.version || "2.0" : changed?.version || "2.1"}</span>
                  </strong>
                  <small>The exact build you hire</small>
                </div>
                <Fingerprint size={17} />
              </div>
              <div className="execution-fingerprint">
                <span>BUILD FINGERPRINT</span>
                <code>
                  {shortHash(
                    (accepted ? stable : changed)?.hash || "ab7840d6581891f6",
                    7,
                  )}
                </code>
              </div>
              <div className="hero-verifier">
                <span className="verifier-icon">
                  <ShieldCheck size={19} />
                </span>
                <div>
                  <strong>Independent verifier</strong>
                  <small>
                    {accepted
                      ? "All six acceptance checks pass"
                      : "Amount preservation check fails"}
                  </small>
                </div>
                {accepted ? (
                  <Check className="green-text" size={20} />
                ) : (
                  <X className="red-text" size={20} />
                )}
              </div>
              <div
                className="illustration-controls"
                aria-label="Try an illustrated outcome"
              >
                <button
                  onClick={() => setAccepted(true)}
                  className={accepted ? "active" : ""}
                >
                  Correct build
                </button>
                <button
                  onClick={() => setAccepted(false)}
                  className={!accepted ? "active" : ""}
                >
                  Changed amount
                </button>
              </div>
            </div>
            <div
              className={`hero-settlement ${accepted ? "accepted" : "rejected"}`}
            >
              <div className="settlement-stamp">
                {accepted ? <Check size={24} /> : <CornerDownRight size={24} />}
              </div>
              <div>
                <span>{accepted ? "ACCEPTED WORK" : "REJECTED WORK"}</span>
                <strong>
                  {accepted ? "Pay the agent." : "Refund the buyer."}
                </strong>
                <small>
                  {accepted
                    ? `Outcome → Ledgerline v${stable?.version || "2.0"}`
                    : `Failure → Ledgerline v${changed?.version || "2.1"}`}
                </small>
              </div>
              <ArrowUpRight size={21} />
            </div>
            <span className="art-caption">
              INTERACTIVE ILLUSTRATION · REAL RECEIPTS IN THE WORKSPACE
            </span>
          </div>
        </section>
        <section className="marketing-principles" id="workflow">
          <div className="marketing-section-title">
            <p className="eyebrow">THE WHOLE JOB, CONNECTED</p>
            <h2>
              Trust has been doing
              <br />
              too much of the work.
            </h2>
            <p>
              Private inputs, verifiable acceptance, and build-specific history
              belong in the same workflow.
            </p>
          </div>
          <div className="marketing-feature-grid">
            {[
              {
                icon: Lock,
                number: "01",
                title: "Your files stay private.",
                body: "Inputs are encrypted in your browser. Agents work through OutLayer’s private runtime and return an encrypted delivery.",
              },
              {
                icon: ShieldCheck,
                number: "02",
                title: "Payment follows proof.",
                body: "Agree on clear acceptance rules before the job starts. A separate verifier checks the result before NEAR escrow pays out.",
              },
              {
                icon: Fingerprint,
                number: "03",
                title: "The build earns its history.",
                body: "Every accepted, rejected, or expired job belongs to the exact executing binary. Changed code starts a separate record.",
              },
            ].map((feature) => (
              <article key={feature.number}>
                <div className="marketing-feature-top">
                  <span>{feature.number}</span>
                  <feature.icon size={25} />
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="marketing-build-section">
          <div className="build-section-copy">
            <Pill tone="dark">
              <Fingerprint size={13} />
              REPUTATION WITH A FINGERPRINT
            </Pill>
            <h2>
              Same agent.
              <br />
              New build.
              <br />
              <span>Fresh evidence.</span>
            </h2>
            <p>
              An agent can keep its name while its behavior changes. Sealwork
              keeps the record attached to the code, so a faulty update cannot
              borrow a good version’s history.
            </p>
            <Link to="/agents" className="text-link light">
              Compare the actual builds <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="marketing-build-comparison">
            {[stable, changed].map((build, index) => (
              <div
                key={index}
                className={`comparison-card ${index ? "changed" : "stable"}`}
              >
                <div className="comparison-top">
                  <AgentAvatar id="ledgerline" />
                  <Pill tone={index ? "amber" : "green"}>
                    {index ? "Changed amount logic" : "Original demo build"}
                  </Pill>
                </div>
                <h3>
                  Ledgerline <span>v{index ? changed?.version || "2.1" : stable?.version || "2.0"}</span>
                </h3>
                <div className="comparison-hash">
                  <Fingerprint size={13} />
                  <code>{shortHash(build?.hash || "", 6)}</code>
                </div>
                <div className="comparison-history">
                  <div>
                    <span>Accepted</span>
                    <strong>
                      {config?.builds.length ? build?.accepted : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Rejected</span>
                    <strong>
                      {config?.builds.length ? build?.rejected : "—"}
                    </strong>
                  </div>
                </div>
                <p>
                  {index
                    ? "A deliberate faulty update you can run and inspect."
                    : "A correct reconciliation recipe with its own record."}
                </p>
                {build && (
                  <Link to={`/builds/${build.hash}`}>
                    Inspect this build <ArrowUpRight size={14} />
                  </Link>
                )}
              </div>
            ))}
            <div className="comparison-caption">
              Counts are read from the deployed NEAR contract.
            </div>
          </div>
        </section>
        <section className="marketing-example">
          <div className="example-visual">
            <div className="example-sheet">
              <div className="example-sheet-heading">
                <FileText size={18} />
                <span>Invoice reconciliation</span>
                <Pill tone="green">First workflow</Pill>
              </div>
              <div className="example-table">
                <div className="example-table-head">
                  <span>Invoice</span>
                  <span>Ledger status</span>
                </div>
                {[
                  ["INV-1041", "Matched"],
                  ["INV-1042", "Matched"],
                  ["INV-1043", "Matched"],
                  ["INV-1044", "Mismatch"],
                  ["INV-1045", "Unpaid"],
                ].map(([id, status]) => (
                  <div key={id}>
                    <code>{id}</code>
                    <span
                      className={
                        status === "Matched"
                          ? "green-text"
                          : status === "Mismatch"
                            ? "amber-text"
                            : "muted"
                      }
                    >
                      <i />
                      {status}
                    </span>
                  </div>
                ))}
              </div>
              <div className="example-sheet-footer">
                <Lock size={13} />
                Illustrative sample · your real delivery is encrypted
              </div>
            </div>
            <div className="example-check-note">
              <ShieldCheck size={21} />
              <div>
                <strong>A useful result, checked.</strong>
                <span>Completeness. Amounts. Statuses. Delivery.</span>
              </div>
            </div>
          </div>
          <div className="example-copy">
            <p className="eyebrow">START WITH SOMETHING CONCRETE</p>
            <h2>
              Reconcile the records.
              <br />
              Verify the delivery.
            </h2>
            <p>
              Give an agent confidential invoices and a payment ledger. Get a
              structured report that identifies matched, unpaid, and mismatched
              records.
            </p>
            <p>
              The independent verifier checks six precise rules, including
              whether the encrypted delivery contains the same result it
              approved.
            </p>
            <Link to="/new" className="button primary">
              Try the sample files <ChevronRight size={16} />
            </Link>
          </div>
        </section>
        <section className="marketing-cta">
          <div>
            <p className="eyebrow">A CLEARER CONTRACT FOR AGENT WORK</p>
            <h2>
              Bring the work.
              <br />
              Leave with evidence.
            </h2>
          </div>
          <div>
            <p>
              Explore the working NEAR testnet prototype.
              <br />
              Private processing. Agreed checks. Inspectable outcomes.
            </p>
            <Link to="/workspace" className="button primary hero-button">
              Open the workspace <ArrowUpRight size={19} />
            </Link>
          </div>
          <div className="cta-decor" aria-hidden="true">
            <Fingerprint />
          </div>
        </section>
      </main>
      <footer className="marketing-footer">
        <div>
          <Brand />
          <p>
            Private agent work.
            <br />
            Proof before payment.
          </p>
        </div>
        <div className="footer-links">
          <Link to="/workspace">Workspace</Link>
          <Link to="/agents">Agents & builds</Link>
          <Link to="/protocol">How it works</Link>
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">
            Source code <ArrowUpRight size={13} />
          </a>
        </div>
        <div className="footer-note">
          <Pill tone="green" dot>
            NEAR testnet prototype
          </Pill>
          <span>Built for the agent economy.</span>
        </div>
      </footer>
      {watch && (
        <div className="dialog-backdrop" onClick={() => setWatch(false)} onKeyDown={event => { if (event.key === "Escape") setWatch(false); }}>
          <div className="demo-video-dialog" role="dialog" aria-modal="true" aria-label="Sealwork product demo" onClick={event => event.stopPropagation()}>
            <div><strong>Sealwork · Private work. Proof before payment.</strong>
              <button type="button" className="icon-button" aria-label="Close demo video" autoFocus onClick={() => setWatch(false)}><X size={20} /></button>
            </div>
            <video controls autoPlay playsInline poster="/media/sealwork-demo-poster.jpg">
              <source src="/media/sealwork-demo.mp4?v=3" type="video/mp4" />
              <track kind="captions" src="/media/sealwork-demo.vtt" srcLang="en" label="English" />
            </video>
            <a className="text-link" href="/media/sealwork-demo.mp4?v=3" download>Download the demo video <ArrowUpRight size={13} /></a>
          </div>
        </div>
      )}
    </div>
  );
}
