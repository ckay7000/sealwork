import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Fingerprint,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  FileText,
  Clock,
  Code2,
  ExternalLink,
  Layers,
  Wallet,
} from "lucide-react";
import {
  AgentCard,
  JobsTable,
  PageHeading,
  Pill,
  Loading,
  CopyValue,
} from "./components";
import { SOURCE_URL, useData } from "./data";
import { nearAmount } from "../shared/format";
import { CHECKS } from "../shared/types";

export function Overview() {
  const { config, builds, jobs, loading } = useData();
  const live = Boolean(config?.builds.length);
  const accepted = builds.reduce((sum, build) => sum + build.accepted, 0);
  const refunded = builds.reduce(
    (sum, build) =>
      sum + build.rejected + build.timed_out + build.execution_errors,
    0,
  );
  const earned = builds.reduce((sum, build) => sum + BigInt(build.earned), 0n);
  const stats = [
    {
      label: "Verified deliveries",
      value: live ? accepted : "—",
      icon: ShieldCheck,
      note: "All agreed checks passed",
    },
    {
      label: "Budget released",
      value: live ? nearAmount(earned) : "—",
      unit: "NEAR",
      icon: Wallet,
      note: "Paid for accepted work",
    },
    {
      label: "Refunded jobs",
      value: live ? refunded : "—",
      icon: Clock,
      note: "Rejected, expired, or interrupted",
    },
    {
      label: "Distinct agent builds",
      value: builds.length,
      icon: Fingerprint,
      note: "Each with its own history",
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="YOUR WORK, WITH PROOF"
        title="Good work deserves more than trust."
        description="Hire a private agent. Agree on the checks. Pay for the result that passes."
        action={
          <Link className="button primary" to="/new">
            <Plus size={16} />
            New private job
          </Link>
        }
      />
      <section className="overview-feature">
        <div className="overview-feature-copy">
          <Pill tone="green">
            <Lock size={12} />
            Confidential invoice reconciliation
          </Pill>
          <h2>
            A private job.
            <br />
            An outcome you can inspect.
          </h2>
          <p>
            Turn invoices and payment records into a checked reconciliation
            report. Start with sample files, or bring your own.
          </p>
          <div className="button-row">
            <Link to="/new" className="button primary">
              Create your first job <ArrowRight size={16} />
            </Link>
            <Link to="/protocol" className="text-link">
              See how it works <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="feature-footnote">
            <Check size={13} />
            Sponsored NEAR testnet · No wallet needed to try
          </div>
        </div>
        <div className="overview-feature-visual" aria-hidden="true">
          <div className="mini-receipt">
            <div className="mini-receipt-top">
              <span className="receipt-logo">
                <ShieldCheck size={19} />
              </span>
              <span>Acceptance receipt</span>
              <span className="mini-receipt-tag">ILLUSTRATION</span>
            </div>
            <div className="mini-receipt-line">
              <span>Invoice reconciliation</span>
              <strong>6 checks</strong>
            </div>
            <div className="mini-check-grid">
              {[
                "Complete",
                "Exact amounts",
                "No duplicates",
                "Private delivery",
              ].map((label) => (
                <span key={label}>
                  <Check size={11} />
                  {label}
                </span>
              ))}
            </div>
            <div className="mini-receipt-divider" />
            <div className="mini-receipt-total">
              <span>Payment rule</span>
              <strong>
                Proof before payout <ArrowUpRight size={14} />
              </strong>
            </div>
          </div>
          <div className="floating-lock">
            <Lock size={17} />
            <span>Files remain encrypted</span>
          </div>
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
        </div>
      </section>
      <div className="stats-grid">
        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <div className="stat-label">
              {stat.label}
              <stat.icon size={15} />
            </div>
            <div className="stat-value">
              {stat.value}
              {stat.unit && <span>{stat.unit}</span>}
            </div>
            <p>{stat.note}</p>
          </article>
        ))}
      </div>
      <section className="surface recent-jobs">
        <div className="section-heading">
          <div>
            <h2>Recent work</h2>
            <p>Public outcomes. Private file contents.</p>
          </div>
          <Link to="/receipts" className="text-link">
            All receipts <ArrowUpRight size={14} />
          </Link>
        </div>
        {loading ? <Loading /> : <JobsTable jobs={jobs.slice(0, 5)} />}
        {config?.status_message && (
          <div className="surface-note" role="status">
            {config.status_message}
          </div>
        )}
      </section>
      <div className="section-heading agent-section-heading">
        <div>
          <p className="eyebrow">CURATED SPECIALISTS</p>
          <h2>The agent is a name. The build is the evidence.</h2>
        </div>
        <Link to="/agents" className="text-link">
          Explore all builds <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="agents-grid">
        {builds.map((build) => (
          <AgentCard key={build.hash} build={build} />
        ))}
      </div>
    </>
  );
}

export function Agents() {
  const { builds } = useData();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const visible = builds.filter(
    (build) =>
      (tab === "all" ||
        (tab === "stable" && !build.version.endsWith(".1")) ||
        (tab === "updates" && build.version.endsWith(".1"))) &&
      `${build.name} ${build.description} ${build.hash}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="HIRE THE EXACT BUILD"
        title="Find your next specialist."
        description="Compare the code you will hire, the checks it must pass, and the outcomes it has earned."
      />
      <div className="catalog-toolbar">
        <div className="tabs" aria-label="Filter builds">
          {[
            ["all", "All builds"],
            ["stable", "Stable demo builds"],
            ["updates", "Changed builds"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="catalog-search">
          <Search size={16} />
          <input
            placeholder="Search agents or fingerprints"
            aria-label="Search agents or fingerprints"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="agents-grid catalog-grid">
        {visible.map((build) => (
          <AgentCard key={build.hash} build={build} />
        ))}
      </div>
      {!visible.length && (
        <div className="empty-state">
          <Search size={24} />
          <h3>No builds match your search</h3>
          <p>Try an agent name, or clear the filters.</p>
          <button
            className="button secondary"
            onClick={() => {
              setQuery("");
              setTab("all");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      <section className="build-principle">
        <div className="principle-icon">
          <Fingerprint size={24} />
        </div>
        <div>
          <h3>Good reviews do not follow changed code.</h3>
          <p>
            A changed binary gets a different fingerprint and a fresh history.
            The faulty Ledgerline update deliberately changes an invoice amount so you can
            test that protection.
          </p>
        </div>
        <Link to="/protocol" className="text-link">
          Why this matters <ArrowUpRight size={14} />
        </Link>
      </section>
    </>
  );
}

export function Receipts() {
  const { jobs, loading, config } = useData();
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const visible = jobs.filter(
    (job) =>
      (tab === "all" ||
        (tab === "accepted" && job.outcome === "accepted") ||
        (tab === "refunded" &&
          job.state === "settled" &&
          job.outcome !== "accepted") ||
        (tab === "active" && job.state !== "settled")) &&
      `${job.title} ${job.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="EVIDENCE FOR EVERY OUTCOME"
        title="Work leaves a receipt."
        description="See what ran, which checks passed, and whether the escrow was paid or refunded."
        action={
          <Link to="/new" className="button primary">
            <Plus size={16} />
            New job
          </Link>
        }
      />
      <div className="catalog-toolbar">
        <div className="tabs">
          {[
            ["all", "All work"],
            ["accepted", "Accepted"],
            ["refunded", "Refunded"],
            ["active", "In progress"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="catalog-search">
          <Search size={16} />
          <input
            placeholder="Search public job names"
            aria-label="Search public job names"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <section className="surface">
        {loading ? <Loading /> : <JobsTable jobs={visible} />}
      </section>
      <div className="privacy-note">
        <Lock size={15} />
        <p>
          The public record contains commitments, checks, and payment outcomes.
          File contents and delivery keys stay private.
        </p>
      </div>
      {config?.status_message && (
        <p className="subtle-status" role="status">
          {config.status_message}
        </p>
      )}
    </>
  );
}

export function Protocol() {
  const { config } = useData();
  return (
    <>
      <PageHeading
        eyebrow="UNDERSTAND SEALWORK"
        title="Private work. Proof before payment."
        description="A marketplace flow for confidential agent work, with a separate acceptance verifier and a history tied to the code that actually ran."
        action={
          <a
            className="button secondary"
            href={SOURCE_URL}
            target="_blank"
            rel="noreferrer"
          >
            Read the source <Code2 size={16} />
          </a>
        }
      />
      <div className="protocol-intro">
        <div>
          <p className="eyebrow">THE PROBLEM</p>
          <h2>
            You can protect a file.
            <br />
            You still need to trust the result.
          </h2>
          <p>
            Businesses want agents to work on private records. Buyers need
            evidence that the job was done correctly. Providers need a clear
            rule for getting paid. A name and a star rating cannot answer those
            questions when the code changes.
          </p>
        </div>
        <div className="protocol-callout">
          <ShieldCheck size={30} />
          <h3>Sealwork connects the whole job.</h3>
          <p>
            Encrypted input → exact agent build → independent checks → automatic
            escrow settlement → a receipt for that build.
          </p>
          <Link to="/new" className="text-link">
            Try the complete flow <ArrowRight size={15} />
          </Link>
        </div>
      </div>
      <div className="protocol-flow">
        {[
          {
            icon: Lock,
            title: "1. Agree & encrypt",
            body: "Choose a build and six acceptance checks. Files and a new delivery key are encrypted in your browser before leaving it.",
          },
          {
            icon: Layers,
            title: "2. Run privately",
            body: "The selected binary executes through OutLayer’s attested runtime. It returns an encrypted artifact, rather than public invoice rows.",
          },
          {
            icon: ShieldCheck,
            title: "3. Check independently",
            body: "A separately pinned verifier recomputes the agreed rules and checks that the encrypted delivery contains the same result.",
          },
          {
            icon: Wallet,
            title: "4. Settle & remember",
            body: "The NEAR contract pays accepted work or refunds rejected and expired jobs. It records the outcome against the exact build.",
          },
        ].map((item) => (
          <article key={item.title}>
            <item.icon size={23} />
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
      <div className="protocol-columns">
        <section className="surface protocol-checks">
          <p className="eyebrow">THE FIRST WORKFLOW</p>
          <h2>Six specific rules. One acceptance decision.</h2>
          <p>
            The prototype reconciles up to 16 confidential invoices against a
            payment ledger. Every rule must pass.
          </p>
          {CHECKS.map((check) => (
            <div key={check.id} className="protocol-check">
              <Check size={16} />
              <div>
                <h4>{check.label}</h4>
                <p>{check.detail}</p>
              </div>
            </div>
          ))}
        </section>
        <div>
          <section className="surface trust-card">
            <p className="eyebrow">WHAT THE EVIDENCE MEANS</p>
            <h2>Know what is being verified.</h2>
            <p>
              <strong>Attestation identifies the execution.</strong> OutLayer
              supplies evidence about the binary, inputs, outputs, and hardware
              environment. It does not decide whether your business rules are
              good.
            </p>
            <p>
              <strong>The verifier decides acceptance.</strong> The fixed rules
              test this invoice workflow. They establish a bounded result,
              rather than a general rating of an agent’s intelligence.
            </p>
            <p>
              <strong>Build history stays separate.</strong> A different binary
              cannot borrow the previous version’s accepted-job count. The
              prototype uses deterministic specialist agents; it does not claim
              to pin an opaque external model.
            </p>
            <p>
              <strong>This is a testnet prototype.</strong> Sponsored jobs use
              an operator-funded account, curated builds, upgradeable contract
              code, and OutLayer’s current trust model. It has not had an
              independent security audit.
            </p>
          </section>
          <section className="protocol-links">
            <h3>Inspect the implementation</h3>
            {config?.verifier_hash && (
              <div>
                <span>Pinned verifier</span>
                <CopyValue value={config.verifier_hash} />
              </div>
            )}
            <a
              href="https://app.outlayer.ai/docs/tee-attestation"
              target="_blank"
              rel="noreferrer"
            >
              OutLayer attestation and verification <ExternalLink size={14} />
            </a>
            <a
              href={`${SOURCE_URL}/tree/main/contracts/market`}
              target="_blank"
              rel="noreferrer"
            >
              NEAR escrow contract <ExternalLink size={14} />
            </a>
            <a
              href={`${SOURCE_URL}/tree/main/workers`}
              target="_blank"
              rel="noreferrer"
            >
              Agent and verifier source <ExternalLink size={14} />
            </a>
          </section>
        </div>
      </div>
    </>
  );
}
