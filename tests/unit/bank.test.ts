import {describe,it,expect} from 'vitest';
import {BANK_INVOICES,BANK_PAYMENTS,approvedLedger,validateBankProposal} from '../../shared/bank';
import type {BankProposal} from '../../shared/bank';

export const bankProposal:BankProposal={decisions:[
  {payment_id:'PAY-01',status:'proposed',allocations:[{invoice_id:'NS-APR-1',amount_minor:50000},{invoice_id:'NS-APR-2',amount_minor:40000}],evidence:'Northstar Studio April settlement',rationale:'The April payment covers both Northstar invoices.'},
  {payment_id:'PAY-02',status:'review',allocations:[],evidence:'',rationale:'Two equal invoices make this payment ambiguous.'},
  {payment_id:'PAY-03',status:'proposed',allocations:[{invoice_id:'PP-FEB',amount_minor:12500}],evidence:'Paper Plane February retainer',rationale:'The vendor and February reference match this invoice.'},
  {payment_id:'PAY-04',status:'unmatched',allocations:[],evidence:'',rationale:'No supplied invoice explains this bank payment.'},
]};
describe('bank reconciliation acceptance',()=>{
  it('splits a combined payment and leaves ambiguity unallocated',()=>{
    expect(validateBankProposal(bankProposal,BANK_INVOICES,BANK_PAYMENTS)).toEqual(bankProposal);
    expect(approvedLedger(bankProposal,BANK_INVOICES,BANK_PAYMENTS)).toBe('invoice_id,amount,currency\n"NS-APR-1",500.00,USD\n"NS-APR-2",400.00,USD\n"PP-FEB",125.00,USD');
  });
  it.each(['duplicate','invented','wrong_total','cross_currency','review_spend','invented_evidence','overallocated'])('rejects %s proposals',kind=>{
    const p=structuredClone(bankProposal);let source=BANK_INVOICES;
    if(kind==='duplicate')p.decisions[1]=structuredClone(p.decisions[0]);
    if(kind==='invented')p.decisions[0].allocations[0].invoice_id='FAKE';
    if(kind==='wrong_total')p.decisions[0].allocations[0].amount_minor--;
    if(kind==='cross_currency')source=source.replace('500.00,USD','500.00,EUR');
    if(kind==='review_spend')p.decisions[1].allocations=[{invoice_id:'FERN-1',amount_minor:25000}];
    if(kind==='invented_evidence')p.decisions[0].evidence='a nonexistent bank reference';
    if(kind==='overallocated')p.decisions[0].allocations=[{invoice_id:'NS-APR-1',amount_minor:90000}];
    expect(()=>validateBankProposal(p,source,BANK_PAYMENTS)).toThrow();
  });
  it('requires unique source payment IDs and completeness',()=>{
    expect(()=>validateBankProposal(bankProposal,BANK_INVOICES,BANK_PAYMENTS.replace('PAY-04','PAY-01'))).toThrow();
    const p=structuredClone(bankProposal);p.decisions.pop();expect(()=>validateBankProposal(p,BANK_INVOICES,BANK_PAYMENTS)).toThrow();
  });
});
