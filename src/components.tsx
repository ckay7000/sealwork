import { useState } from "react";
import type { PropsWithChildren, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  Copy,
  Fingerprint,
  FileText,
  Lock,
  Loader2,
  ChevronRight,
} from "lucide-react";
import type { AgentBuild, Job } from "../shared/types";
import { formatDate, nearAmount, shortHash } from "../shared/format";
import { privateSession, useData } from "./data";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" to="/" aria-label="Sealwork home">
      <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <path d="M18 3 31 10.5v15L18 33 5 25.5v-15L18 3Z" fill="currentColor" />
        <path
          d="m11 18.5 4.5 4.5L26 12.5"
          stroke="var(--brand-check,#fff)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="m18 5 11.5 6.5"
          stroke="var(--brand-check,#fff)"
          strokeOpacity=".35"
          strokeLinecap="round"
        />
      </svg>
      {!compact && (
        <span>
          sealwork<span className="brand-period">.</span>
        </span>
      )}
    </Link>
  );
}
export function Pill({
  tone = "neutral",
  children,
  dot = false,
}: {
  tone?: string;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`pill ${tone}`}>
      {dot && <i />}
      {children}
    </span>
  );
}
export function Status({ job }: { job: Job }) {
  const outcome =
    job.outcome === "accepted"
      ? "Verified"
      : job.outcome === "rejected"
        ? "Rejected"
        : job.outcome === "timed_out"
          ? "Expired"
          : "Execution error";
  const settled =
    job.settlement === "paid"
      ? "Verified & paid"
      : job.settlement === "refunded"
        ? `${outcome} · refunded`
        : job.settlement === "claimable"
          ? `${outcome} · transfer needs retry`
          : `${outcome} · ${job.outcome === "accepted" ? "payment" : "refund"} pending`;
  const labels = {
    funded: "Escrow funded",
    agent_running: "Agent working",
    verifier_running: "Checking delivery",
    settled,
  };
  const tone =
    job.state !== "settled"
      ? "blue"
      : job.outcome === "accepted"
        ? "green"
        : job.outcome === "rejected"
          ? "red"
          : "amber";
  return (
    <Pill tone={tone} dot>
      {labels[job.state]}
    </Pill>
  );
}
export function AgentAvatar({
  id,
  size = "normal",
}: {
  id: string;
  size?: string;
}) {
  return (
    <div
      className={`agent-avatar ${id === "archivist" ? "archivist" : "ledgerline"} ${size}`}
      aria-hidden="true"
    >
      {id === "archivist" ? (
        <FileText size={size === "large" ? 32 : 22} />
      ) : (
        <svg viewBox="0 0 30 30" fill="none">
          <path
            d="M8 6v18h15M13 6v13h10M18 6v8h5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <FileText size={24} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function CopyValue({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useData();
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast(
        "Clipboard access is unavailable. Select and copy the fingerprint directly.",
      );
    }
  }
  return (
    <button
      className="copy-value"
      onClick={() => void copy()}
      aria-label={label || "Copy fingerprint"}
      title={value}
    >
      <code>{shortHash(value, 8)}</code>
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}
export function JobsTable({
  jobs,
  compact = false,
}: {
  jobs: Job[];
  compact?: boolean;
}) {
  const { builds } = useData();
  if (!jobs.length)
    return (
      <Empty
        title="Your next job starts here"
        description="Hire an agent, agree on the checks, and get an inspectable receipt for the outcome."
        action={
          <Link to="/new" className="button primary small">
            Create a private job <ArrowUpRight size={15} />
          </Link>
        }
      />
    );
  return (
    <div className="table-scroll">
      <table className="jobs-table">
        <thead>
          <tr>
            <th>Job & agent</th>
            <th>Outcome</th>
            <th>Budget</th>
            {!compact && <th>Created</th>}
            <th>
              <span className="sr-only">Open receipt</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const build = builds.find((build) => build.hash === job.build_hash);
            const local = Boolean(privateSession(job.id));
            return (
              <tr key={job.id}>
                <td>
                  <Link to={`/jobs/${job.id}`} className="job-title">
                    <span className="job-file">
                      <FileText size={18} />
                    </span>
                    <span>
                      <strong>{job.title}</strong>
                      <small>
                        {build?.name || "Agent"}{" "}
                        <span className="version">
                          v{build?.version || "—"}
                        </span>
                        {local && (
                          <Lock
                            size={10}
                            aria-label="Private delivery key in this browser"
                          />
                        )}
                        <code>{job.id.slice(-8)}</code>
                      </small>
                    </span>
                  </Link>
                </td>
                <td>
                  <Status job={job} />
                </td>
                <td className="numeric">
                  {nearAmount(job.budget)} <span className="muted">NEAR</span>
                </td>
                {!compact && (
                  <td className="table-date">{formatDate(job.created_at)}</td>
                )}
                <td>
                  <Link
                    className="table-arrow"
                    to={`/jobs/${job.id}`}
                    aria-label={`Open ${job.title}`}
                  >
                    <ArrowUpRight size={17} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
export function AgentCard({ build }: { build: AgentBuild }) {
  const { config } = useData();
  const live = Boolean(config?.builds.length);
  const faulty = build.agent_id === "ledgerline" && build.version.endsWith(".1");
  const attempts =
    build.accepted + build.rejected + build.timed_out + build.execution_errors;
  return (
    <article className="agent-card">
      <div className="agent-card-top">
        <AgentAvatar id={build.agent_id} />
        <Pill tone={faulty ? "amber" : "green"}>
          {faulty ? "Faulty demo update" : "Private execution"}
        </Pill>
      </div>
      <Link to={`/builds/${build.hash}`} className="agent-name">
        <h3>{build.name}</h3>
        <span>v{build.version}</span>
        <ArrowUpRight size={15} />
      </Link>
      <p>{build.description}</p>
      <div className="agent-specialties">
        <span>Invoice reconciliation</span>
        <span>6 acceptance checks</span>
      </div>
      <div className="build-card-fingerprint">
        <Fingerprint size={14} />
        <code>{shortHash(build.hash, 7)}</code>
      </div>
      <div className="agent-card-stats">
        <div>
          <small>Accepted jobs</small>
          <strong>
            {live ? build.accepted : "—"}
            <span> / {live ? attempts : "—"}</span>
          </strong>
        </div>
        <div>
          <small>Job budget</small>
          <strong>
            0.050 <span>NEAR</span>
          </strong>
        </div>
      </div>
      <Link
        to={`/new?build=${build.hash}`}
        className={`button ${faulty ? "secondary" : "primary"} full`}
      >
        {faulty ? "Test the changed build" : "Hire this build"}
        <ChevronRight size={16} />
      </Link>
    </article>
  );
}
export function Loading({
  children = "Loading onchain history…",
}: PropsWithChildren) {
  return (
    <div className="loading">
      <Loader2 size={18} className="spin" />
      {children}
    </div>
  );
}
