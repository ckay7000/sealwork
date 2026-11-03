import { useState } from 'react';
import { bankRecords, cents, validateBankProposal } from '../shared/bank';
import type { Allocation, BankProposal } from '../shared/bank';
import { minorAmount, reconciliationSummary } from '../shared/reconciliation';
import { Pill } from './components';

export function ReconciliationReview({proposal,source,payments,onChange,disabled=false}:{proposal:BankProposal;source:string;payments:string;onChange:(p:BankProposal)=>void;disabled?:boolean}) {
  const [filter,setFilter]=useState('all');
  const [editing,setEditing]=useState<string|null>(null);
  const [draft,setDraft]=useState<{invoice_id:string;amount:string}[]>([]);
  const [reason,setReason]=useState('');
  const [error,setError]=useState('');
  const records=bankRecords(source,payments);
  const summary=reconciliationSummary(proposal,source,payments);
  const change=(id:string,status:'proposed'|'review'|'unmatched',allocations:Allocation[],rationale:string)=>{
    const payment=records.bank.find(p=>p.payment_id===id)!;
    try {
      const next={decisions:proposal.decisions.map(d=>d.payment_id===id?{payment_id:id,status,allocations,evidence:status==='proposed'?payment.description:'',rationale}:d)};
      validateBankProposal(next,source,payments);onChange(next);setEditing(null);setError('');
    } catch(e){setError(e instanceof Error?e.message:'Check the allocation amounts.');}
  };
  return <div className="reconciliation-review">
    <div className="reconciliation-totals" aria-label="Reconciliation totals">{summary.map(t=><article key={t.currency}>
      <strong>{t.currency}</strong><dl><div><dt>Bank receipts</dt><dd>{minorAmount(t.received_minor)}</dd></div><div><dt>Allocated</dt><dd>{minorAmount(t.allocated_minor)}</dd></div><div><dt>Unresolved receipts</dt><dd>{minorAmount(t.unresolved_minor)}</dd></div><div><dt>Outstanding invoices</dt><dd>{minorAmount(t.outstanding_minor)}</dd></div></dl>
    </article>)}</div>
    <label className="field-label" htmlFor="review-filter">Review queue</label>
    <select id="review-filter" className="text-input" value={filter} onChange={e=>setFilter(e.target.value)}>
      <option value="all">All {proposal.decisions.length} receipts</option>
      <option value="review">Needs review ({proposal.decisions.filter(d=>d.status==='review').length})</option>
      <option value="unmatched">Unmatched ({proposal.decisions.filter(d=>d.status==='unmatched').length})</option>
      <option value="proposed">Proposed matches ({proposal.decisions.filter(d=>d.status==='proposed').length})</option>
    </select>
    {proposal.decisions.filter(d=>filter==='all'||d.status===filter).map(d=>{
      const payment=records.bank.find(p=>p.payment_id===d.payment_id)!;
      const available=(id:string)=>cents(records.invoices.find(i=>i.invoice_id===id)!.amount)-proposal.decisions.filter(other=>other.payment_id!==d.payment_id).flatMap(other=>other.allocations).filter(a=>a.invoice_id===id).reduce((n,a)=>n+a.amount_minor,0);
      return <article className="bank-decision" key={d.payment_id}>
        <div><strong>{d.payment_id} · {minorAmount(cents(payment.amount))} {payment.currency.toUpperCase()}</strong><Pill tone={d.status==='proposed'?'green':d.status==='review'?'amber':'neutral'}>{d.status==='proposed'?'Proposed match':d.status==='review'?'Needs review':'Unmatched'}</Pill></div>
        <blockquote>{payment.description}</blockquote><p>{d.rationale}</p>
        {d.allocations.map(a=><p key={a.invoice_id}>{a.invoice_id} · {minorAmount(a.amount_minor)} {payment.currency.toUpperCase()}</p>)}
        {editing===d.payment_id?<div className="allocation-editor">
          <p>Allocate the complete receipt. Invoice balances include the other decisions in this batch.</p>
          {draft.map((a,index)=><div className="allocation-fields" key={index}>
            <select className="text-input" aria-label={`Invoice for allocation ${index+1} of ${d.payment_id}`} value={a.invoice_id} onChange={e=>setDraft(draft.map((v,j)=>j===index?{...v,invoice_id:e.target.value}:v))}>
              <option value="">Choose an invoice</option>{records.invoices.filter(i=>i.currency.toUpperCase()===payment.currency.toUpperCase()).map(i=><option value={i.invoice_id} key={i.invoice_id}>{i.invoice_id} · {i.vendor} · {minorAmount(available(i.invoice_id))} available</option>)}
            </select>
            <input className="text-input" inputMode="decimal" aria-label={`Amount for allocation ${index+1} of ${d.payment_id}`} value={a.amount} onChange={e=>setDraft(draft.map((v,j)=>j===index?{...v,amount:e.target.value}:v))}/>
            <button className="button secondary small" type="button" onClick={()=>setDraft(draft.filter((_,j)=>j!==index))}>Remove</button>
          </div>)}
          <button className="button secondary small" type="button" disabled={draft.length>=16} onClick={()=>setDraft([...draft,{invoice_id:'',amount:''}])}>Add invoice allocation</button>
          <label className="field-label" htmlFor={`reason-${d.payment_id}`}>Why does this receipt belong to these invoices?</label>
          <input id={`reason-${d.payment_id}`} className="text-input" value={reason} maxLength={400} onChange={e=>setReason(e.target.value)} placeholder="Record the evidence you reviewed"/>
          {error&&<p className="form-error" role="alert">{error}</p>}
          <div className="review-actions"><button className="button primary small" type="button" disabled={disabled} onClick={()=>{try{change(d.payment_id,'proposed',draft.map(a=>({invoice_id:a.invoice_id,amount_minor:cents(a.amount)})),reason);}catch(e){setError(e instanceof Error?e.message:'Check the amounts.');}}}>Apply reviewed allocation</button><button className="button secondary small" type="button" onClick={()=>{setEditing(null);setError('');}}>Cancel</button></div>
        </div>:<div className="review-actions">
          <button className="button secondary small" type="button" disabled={disabled} onClick={()=>{setEditing(d.payment_id);setDraft(d.allocations.length?d.allocations.map(a=>({invoice_id:a.invoice_id,amount:minorAmount(a.amount_minor)})):[{invoice_id:'',amount:payment.amount}]);setReason('');setError('');}}>Review allocation</button>
          {d.status==='proposed'&&<button className="button secondary small" type="button" disabled={disabled} onClick={()=>change(d.payment_id,'review',[],'The bookkeeper withheld this match pending additional evidence.')}>Keep unresolved</button>}
        </div>}
      </article>;
    })}
    <p className="field-hint">Your edits become the approved decision checked by the separate verifier. Model evidence covers the original AI proposal, when used. Neither confirms the payer’s intent or the authenticity of an invoice.</p>
  </div>;
}
