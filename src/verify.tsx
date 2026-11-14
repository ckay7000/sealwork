import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Check, Download, ExternalLink, Loader2, ShieldCheck, X } from 'lucide-react';
import { PageHeading, Pill } from './components';
import { downloadJson } from './data';
import { checkPublicReceipt } from '../shared/receipt-check';
import type { ReceiptReport } from '../shared/receipt-check';
import deployment from '../deployments/testnet.json' with { type: 'json' };

export function VerifyReceipt() {
  const { id = '' } = useParams(), [query] = useSearchParams();
  const contract = query.get('contract') || deployment.contract_id;
  const [report, setReport] = useState<ReceiptReport | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function check() { setBusy(true); setError(''); setReport(null); try { setReport(await checkPublicReceipt({ jobId: id, contractId: contract })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <><PageHeading eyebrow="CHECK THE PUBLIC EVIDENCE" title="Read the receipt from NEAR." description="Check the recorded outcome, payment rules and exact downloaded code. This page reads the public blockchain directly; it needs no wallet or recovery file."/>
    <section className="surface receipt-check-intro"><Pill tone="green">Read only · no funds spent</Pill><h2>What will be checked?</h2><p>The job and registered worker come from one finalized NEAR block. The worker and verifier files are downloaded and hashed to check that their bytes match the recorded fingerprints.</p><p className="receipt-check-id">{id}<br/>{contract}</p><button className="button primary" disabled={busy} onClick={() => void check()}>{busy ? <Loader2 className="spin" size={17}/> : <ShieldCheck size={17}/>} {busy ? 'Reading NEAR and checking code…' : 'Check directly against NEAR'}</button><Link className="text-link" to={`/jobs/${id}`}>Open the original receipt <ExternalLink size={14}/></Link>{error && <p className="form-error" role="alert">{error}</p>}</section>
    {report && <section className="surface receipt-check-report" aria-live="polite"><div className="section-heading"><div><h2>{report.passed ? 'The public receipt is consistent.' : 'Some public checks did not pass.'}</h2><p>{report.outcome} · {report.settlement} · finalized block {report.block_height}</p></div><button className="button secondary small" onClick={() => downloadJson(`${id}-public-check.json`, report)}><Download size={14}/>Export check report</button></div><div className="receipt-check-list">{report.checks.map(c => <article key={c.id} data-check={c.id} data-passed={c.passed}>{c.passed ? <Check className="green-text" size={19}/> : <X className="red-text" size={19}/>}<div><strong>{c.label}</strong><p>{c.detail}</p></div><Pill tone={c.passed ? 'green' : 'amber'}>{c.passed ? 'Passed' : 'Not passed'}</Pill></article>)}</div><p className="receipt-check-id">NEAR block hash: {report.block_hash}</p></section>}
    <section className="surface receipt-check-boundaries"><h2>What this does and does not establish</h2><p>A consistent public receipt shows that the recorded checks, settlement and downloaded code agree. It does not independently recompute the private financial report, prove that the source invoices are genuine, or perform full hardware-quote verification.</p><p>Inspect both execution cards on the original receipt for OutLayer evidence. Public RPC responses, the application code and the contract’s retained upgrade authority remain trust dependencies.</p><a className="text-link" href="https://github.com/ckay7000/sealwork/blob/main/docs/VERIFY_A_JOB.md" target="_blank" rel="noreferrer">Run the same read-only check outside this website <ExternalLink size={14}/></a></section>
  </>;
}
