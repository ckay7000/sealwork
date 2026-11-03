import type { BankProposal } from '../shared/bank';
import { Pill } from './components';

export function BankDecisions({proposal}:{proposal:BankProposal}){
  return <div className="bank-decisions">{proposal.decisions.map(d=><article className="bank-decision" key={d.payment_id}>
    <div><strong>{d.payment_id}</strong><Pill tone={d.status==='proposed'?'green':d.status==='review'?'amber':'neutral'}>{d.status==='proposed'?'Proposed match':d.status==='review'?'Needs review':'Unmatched'}</Pill></div>
    {d.allocations.length>0 && <p className="bank-allocations">{d.allocations.map(a=><span key={a.invoice_id}>{a.invoice_id} · {(a.amount_minor/100).toFixed(2)}</span>)}</p>}
    <p>{d.rationale}</p>{d.evidence && <blockquote>“{d.evidence}”</blockquote>}
  </article>)}</div>;
}
