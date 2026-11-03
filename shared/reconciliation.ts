import { bankRecords, cents, validateBankProposal } from './bank';
import type { BankProposal } from './bank';
import type { PrivateResult, ResultRow } from './types';

export interface CurrencySummary {
  currency: string;
  invoiced_minor: number;
  received_minor: number;
  allocated_minor: number;
  outstanding_minor: number;
  unresolved_minor: number;
}
export function reconciliationSummary(proposal: BankProposal, source: string, payments: string): CurrencySummary[] {
  validateBankProposal(proposal, source, payments);
  const records = bankRecords(source, payments);
  const totals = new Map<string, CurrencySummary>();
  const group = (currency: string) => {
    const c = currency.toUpperCase();
    if (!totals.has(c)) totals.set(c, {currency:c,invoiced_minor:0,received_minor:0,allocated_minor:0,outstanding_minor:0,unresolved_minor:0});
    return totals.get(c)!;
  };
  const add = (a: number, b: number) => { const n=a+b; if (!Number.isSafeInteger(n)) throw Error('The batch total exceeds the supported amount range.'); return n; };
  for (const i of records.invoices) { const t=group(i.currency); t.invoiced_minor=add(t.invoiced_minor,cents(i.amount)); }
  for (const p of records.bank) {
    const t=group(p.currency); t.received_minor=add(t.received_minor,cents(p.amount));
    const d=proposal.decisions.find(d=>d.payment_id===p.payment_id)!;
    t.allocated_minor=add(t.allocated_minor,d.allocations.reduce((n,a)=>add(n,a.amount_minor),0));
  }
  for (const t of totals.values()) {t.outstanding_minor=t.invoiced_minor-t.allocated_minor;t.unresolved_minor=t.received_minor-t.allocated_minor;}
  return [...totals.values()].sort((a,b)=>a.currency.localeCompare(b.currency));
}
export const minorAmount = (n: number) => `${Math.floor(n/100)}.${String(n%100).padStart(2,'0')}`;
// Preserve original values in JSON; neutralize formula-leading cells only in
// spreadsheet CSV exports so untrusted descriptions cannot become formulas.
const csvCell = (value: string | number) => { const s=String(value); return '"'+(/^[=+@\-\t\r]/.test(s)?"'"+s:s).replaceAll('"','""')+'"'; };
export const csvReport = (rows: (string | number)[][]) => '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
export function invoiceCsv(rows: ResultRow[]): string {
  return csvReport([['invoice_id','vendor','currency','invoice_amount','allocated_amount','outstanding_amount','status'],...rows.map(r=>[r.invoice_id,r.vendor,r.currency,minorAmount(r.amount_minor),r.paid_minor===undefined?'':minorAmount(r.paid_minor),r.remaining_minor===undefined?'':minorAmount(r.remaining_minor),r.status])]);
}
export function paymentsCsv(result: PrivateResult): string {
  if (!result.payments || !result.bank) throw Error('This delivery does not include checked payment records.');
  return csvReport([['payment_id','description','currency','received_amount','allocated_amount','unresolved_amount','status','invoice_allocations','review_reason'],...result.payments.map(p=>{
    const d=result.bank!.decisions.find(d=>d.payment_id===p.payment_id)!;
    return [p.payment_id,p.description,p.currency,minorAmount(p.amount_minor),minorAmount(p.allocated_minor),minorAmount(p.remaining_minor),d.status,d.allocations.map(a=>`${a.invoice_id}: ${minorAmount(a.amount_minor)}`).join('; '),d.rationale];
  })]);
}
