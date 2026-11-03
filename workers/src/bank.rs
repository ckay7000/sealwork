use super::*;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Allocation { pub invoice_id: String, pub amount_minor: u64 }
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct BankDecision {
    pub payment_id: String, pub status: String, pub allocations: Vec<Allocation>,
    pub evidence: String, pub rationale: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct BankProposal { pub decisions: Vec<BankDecision> }
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BankInput { pub payments_csv: String, pub proposal: BankProposal }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CheckedBankPayment {
    pub payment_id: String, pub description: String, pub currency: String,
    pub amount_minor: u64, pub allocated_minor: u64, pub remaining_minor: u64,
}

pub fn payment_rows(bank: &BankInput) -> Result<Vec<CheckedBankPayment>, &'static str> {
    let payments = csv_rows(&bank.payments_csv, &["payment_id", "description", "amount", "currency"])?;
    payments.into_iter().map(|p| {
        let decision = bank.proposal.decisions.iter().find(|d| d.payment_id == p["payment_id"]).ok_or("bank_completeness_failed")?;
        let amount = minor_units(&p["amount"])?;
        let allocated = decision.allocations.iter().try_fold(0u64, |sum,a| sum.checked_add(a.amount_minor).ok_or("amount_invalid"))?;
        Ok(CheckedBankPayment { payment_id:p["payment_id"].clone(), description:p["description"].clone(), currency:currency(&p["currency"])?, amount_minor:amount, allocated_minor:allocated, remaining_minor:amount.checked_sub(allocated).ok_or("bank_payment_total_failed")? })
    }).collect()
}

pub fn approved_ledger(input: &PrivateInput, bank: &BankInput) -> Result<String, &'static str> {
    if bank.payments_csv.len() > 10000 { return Err("input_too_large"); }
    let invoices = csv_rows(&input.source_csv, &["invoice_id", "vendor", "amount", "currency"])?;
    let payments = csv_rows(&bank.payments_csv, &["payment_id", "description", "amount", "currency"])?;
    if invoices.is_empty() || payments.is_empty() || bank.proposal.decisions.len() != payments.len() { return Err("bank_completeness_failed"); }
    let mut invoice_map = BTreeMap::new();
    for i in invoices {
        let key = id(&i["invoice_id"])?;
        let amount = minor_units(&i["amount"])?;
        if amount == 0 { return Err("amount_invalid"); }
        if invoice_map.insert(key, (currency(&i["currency"])?, amount)).is_some() { return Err("source_duplicate"); }
    }
    let mut payment_map = BTreeMap::new();
    for p in payments {
        let key = id(&p["payment_id"])?;
        if p["description"].is_empty() || p["description"].len() > 500 || minor_units(&p["amount"])? == 0 { return Err("bank_record_invalid"); }
        if payment_map.insert(key, p).is_some() { return Err("bank_duplicate_payment"); }
    }
    let mut seen = BTreeSet::new(); let mut allocated: BTreeMap<String,u64> = BTreeMap::new();
    let mut lines = Vec::new();
    for d in &bank.proposal.decisions {
        if !seen.insert(&d.payment_id) { return Err("bank_duplicate_decision"); }
        let p = payment_map.get(&d.payment_id).ok_or("bank_unknown_payment")?;
        if !["proposed", "review", "unmatched"].contains(&d.status.as_str()) || d.allocations.len() > 16 || d.rationale.len() < 10 || d.rationale.len() > 400 || d.rationale.chars().any(char::is_control) || !p["description"].contains(&d.evidence) { return Err("bank_evidence_invalid"); }
        if d.status != "proposed" && !d.allocations.is_empty() { return Err("bank_uncertainty_allocated"); }
        if d.status == "proposed" && (d.allocations.is_empty() || d.evidence.trim().is_empty()) { return Err("bank_evidence_invalid"); }
        let c = currency(&p["currency"])?; let mut sum = 0u64; let mut ids = BTreeSet::new();
        for a in &d.allocations {
            let (invoice_currency, invoice_amount) = invoice_map.get(&a.invoice_id).ok_or("bank_unknown_invoice")?;
            if !ids.insert(&a.invoice_id) || a.amount_minor == 0 || a.amount_minor > 9_007_199_254_740_991 || &c != invoice_currency { return Err("bank_allocation_invalid"); }
            sum = sum.checked_add(a.amount_minor).ok_or("amount_invalid")?;
            let total = allocated.entry(a.invoice_id.clone()).or_default();
            *total = total.checked_add(a.amount_minor).ok_or("amount_invalid")?;
            if *total > *invoice_amount { return Err("bank_invoice_overallocated"); }
            let quoted = format!("\"{}\"", a.invoice_id.replace('"', "\"\""));
            lines.push(format!("{},{:}.{:02},{}", quoted, a.amount_minor/100, a.amount_minor%100,c));
        }
        if d.status == "proposed" && sum != minor_units(&p["amount"])? { return Err("bank_payment_total_failed"); }
    }
    Ok(format!("invoice_id,amount,currency\n{}", lines.join("\n")))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input() -> PrivateInput {
        let mut i: PrivateInput = serde_json::from_value(serde_json::json!({
            "job_id":"sw_11111111111111111111111111111111", "source_csv":"invoice_id,vendor,amount,currency\nA,Northstar,500.00,USD\nB,Northstar,400.00,USD\nC,Fern,250.00,USD\nD,Fern,250.00,USD", "ledger_csv":"", "buyer_key":"33".repeat(32), "salt":"44".repeat(32),
            "bank":{"payments_csv":"payment_id,description,amount,currency\nP,Northstar April settlement,900.00,USD\nQ,Fern unclear settlement,250.00,USD","proposal":{"decisions":[
                {"payment_id":"P","status":"proposed","allocations":[{"invoice_id":"A","amount_minor":50000},{"invoice_id":"B","amount_minor":40000}],"evidence":"Northstar April settlement","rationale":"The combined payment covers the two Northstar invoices."},
                {"payment_id":"Q","status":"review","allocations":[],"evidence":"","rationale":"Two equal invoices make this payment ambiguous."}
            ]}}
        })).unwrap();
        i.ledger_csv = approved_ledger(&i,i.bank.as_ref().unwrap()).unwrap(); i
    }
    #[test] fn combined_payments_and_review_survive_independent_verification() {
        let i=input(); let r=expected_result(&i).unwrap();
        assert_eq!(r.rows.iter().map(|r|r.status.as_str()).collect::<Vec<_>>(),vec!["matched","matched","unpaid","unpaid"]);
        assert_eq!(r.bank.unwrap().decisions[1].status,"review");
    }
    #[test] fn money_cannot_be_reused_across_invoices_or_payments() {
        let mut i=input();i.bank.as_mut().unwrap().proposal.decisions[0].allocations[1].amount_minor=50000;
        assert!(expected_result(&i).is_err());
        let mut i=input();let d=i.bank.as_ref().unwrap().proposal.decisions[0].clone();i.bank.as_mut().unwrap().proposal.decisions[1]=d;
        assert_eq!(expected_result(&i).unwrap_err(),"bank_duplicate_decision");
    }
    #[test] fn ambiguous_decisions_cannot_allocate_and_sources_cannot_be_swapped() {
        let mut i=input();i.bank.as_mut().unwrap().proposal.decisions[1].allocations.push(Allocation{invoice_id:"C".to_owned(),amount_minor:25000});
        assert_eq!(expected_result(&i).unwrap_err(),"bank_uncertainty_allocated");
        let mut i=input();i.ledger_csv.push_str("\nC,250.00,USD");assert_eq!(expected_result(&i).unwrap_err(),"bank_ledger_binding_failed");
    }
    #[test] fn evidence_currencies_and_completeness_are_checked() {
        let mut i=input();i.bank.as_mut().unwrap().proposal.decisions[0].evidence="invented receipt".to_owned();assert!(expected_result(&i).is_err());
        let mut i=input();i.bank.as_mut().unwrap().payments_csv=i.bank.as_ref().unwrap().payments_csv.replace("900.00,USD","900.00,EUR");assert!(expected_result(&i).is_err());
        let mut i=input();i.bank.as_mut().unwrap().proposal.decisions.pop();assert_eq!(expected_result(&i).unwrap_err(),"bank_completeness_failed");
    }
    #[test] fn unresolved_bank_amounts_are_part_of_the_checked_delivery() {
        let i=input();let c=input_commitment(&i).unwrap();
        let mut r=expected_result(&i).unwrap();
        assert_eq!(r.payments.as_ref().unwrap()[1].remaining_minor,25000);
        r.payments.as_mut().unwrap()[1].remaining_minor=0;
        let raw=serde_json::to_string(&r).unwrap();
        let a=Artifact{job_id:i.job_id.clone(),input_commitment:c.clone(),manifest_hash:"55".repeat(32),result_commitment:result_commitment(&raw,&i.salt),result_ciphertext:encrypt_delivery(&i,&c,&raw).unwrap(),result:raw};
        assert!(!verify(&i,&c,&a).unwrap().iter().find(|c|c.id=="ledger_matches").unwrap().passed);
    }
}
