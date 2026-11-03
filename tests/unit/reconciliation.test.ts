import {describe,it,expect} from 'vitest';
import {BANK_INVOICES,BANK_PAYMENTS,suggestBankMatches,validateBankProposal} from '../../shared/bank';
import {csvReport,invoiceCsv,reconciliationSummary} from '../../shared/reconciliation';

describe('bookkeeper reconciliation',()=>{
  it('finds a unique combined receipt while preserving equal-invoice ambiguity',()=>{
    const p=suggestBankMatches(BANK_INVOICES,BANK_PAYMENTS);
    expect(p.decisions[0].allocations).toEqual([{invoice_id:'NS-APR-1',amount_minor:50000},{invoice_id:'NS-APR-2',amount_minor:40000}]);
    expect(p.decisions[1]).toMatchObject({status:'review',allocations:[]});
    expect(reconciliationSummary(p,BANK_INVOICES,BANK_PAYMENTS)).toEqual([{currency:'USD',invoiced_minor:152500,received_minor:137400,allocated_minor:102500,outstanding_minor:50000,unresolved_minor:34900}]);
  });
  it('supports two partial receipts against one explicitly referenced invoice without reusing funds',()=>{
    const source='invoice_id,vendor,amount,currency\nINV-7,Acme,100.00,USD';
    const payments='payment_id,description,amount,currency\nP1,First receipt INV-7,40.00,USD\nP2,Final receipt INV-7,60.00,USD';
    const p=suggestBankMatches(source,payments);
    expect(p.decisions.map(d=>d.allocations[0].amount_minor)).toEqual([4000,6000]);
    expect(reconciliationSummary(p,source,payments)[0].outstanding_minor).toBe(0);
    const invalid=structuredClone(p);invalid.decisions[1].allocations[0].amount_minor=6001;
    expect(()=>validateBankProposal(invalid,source,payments)).toThrow();
  });
  it('does not mistake a substring for an explicit invoice reference or mix currencies',()=>{
    const source='invoice_id,vendor,amount,currency\nA,Acme,25.00,USD\nB,Fern,25.00,EUR';
    const payments='payment_id,description,amount,currency\nP,BANK TRANSFER,25.00,USD\nQ,Acme payment,25.00,EUR';
    expect(suggestBankMatches(source,payments).decisions.every(d=>d.allocations.length===0)).toBe(true);
  });
  it('neutralizes spreadsheet formulas without changing quoted fields or cent amounts',()=>{
    expect(csvReport([['=HYPERLINK("evil")','Fern, café', '12.35']])).toContain('"\'=HYPERLINK(""evil"")","Fern, café","12.35"');
    expect(invoiceCsv([{invoice_id:'I',vendor:'Acme',currency:'USD',amount_minor:10000,paid_minor:4000,remaining_minor:6000,status:'partial'}])).toContain('"100.00","40.00","60.00","partial"');
  });
});
