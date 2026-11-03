use aes_gcm::{aead::{Aead, Payload}, Aes256Gcm, KeyInit, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
mod bank;
pub use bank::{BankInput, BankProposal};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PrivateInput {
    pub job_id: String,
    pub source_csv: String,
    pub ledger_csv: String,
    pub buyer_key: String,
    pub salt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bank: Option<BankInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PrivatePacket {
    pub input: PrivateInput,
    pub input_commitment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ResultRow {
    pub invoice_id: String,
    pub vendor: String,
    pub amount_minor: u64,
    pub currency: String,
    pub paid_minor: u64,
    pub remaining_minor: u64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SourceHashes {
    pub source_sha256: String,
    pub ledger_sha256: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payments_sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PrivateResult {
    pub schema: String,
    pub rows: Vec<ResultRow>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bank: Option<BankProposal>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payments: Option<Vec<bank::CheckedBankPayment>>,
    pub sources: SourceHashes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Artifact {
    pub job_id: String,
    pub input_commitment: String,
    pub manifest_hash: String,
    pub result: String,
    pub result_commitment: String,
    pub result_ciphertext: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Check {
    pub id: String,
    pub passed: bool,
}

pub fn digest(bytes: &[u8]) -> String { hex::encode(Sha256::digest(bytes)) }

pub fn validate_execution_reference(request_id: Option<&str>, transaction_hash: Option<&str>) -> Result<(), &'static str> {
    // These values come from OutLayer's runtime, never from caller input.
    // The current NEAR runtime supplies a transaction hash but may omit its
    // SDK's optional request ID. Keep that absence explicit in the receipt.
    if request_id.is_some_and(|id| id.is_empty() || id.len() > 20 || !id.bytes().all(|c| c.is_ascii_digit())) {
        return Err("attested_context_invalid");
    }
    if transaction_hash.is_some_and(|hash| !(32..=44).contains(&hash.len()) || !hash.bytes().all(|c| b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz".contains(&c))) {
        return Err("attested_context_invalid");
    }
    if request_id.is_none() && transaction_hash.is_none() { return Err("attested_context_missing"); }
    Ok(())
}

pub fn input_commitment(input: &PrivateInput) -> Result<String, &'static str> {
    // serde_json::Value uses sorted object keys without preserve_order. This
    // is the same canonical form as the browser's recursive canonicalJson.
    let value = serde_json::to_value(input).map_err(|_| "input_invalid")?;
    let canonical = serde_json::to_string(&value).map_err(|_| "input_invalid")?;
    Ok(digest(format!("sealwork:input:v1\0{}", canonical).as_bytes()))
}

pub fn result_commitment(result: &str, salt: &str) -> String {
    digest(format!("sealwork:result:v1\0{}\0{}", salt, result).as_bytes())
}

pub fn validate_packet(packet: &PrivatePacket, job_id: &str, commitment: &str) -> Result<(), &'static str> {
    if packet.input.job_id != job_id || packet.input_commitment != commitment || input_commitment(&packet.input)? != commitment {
        return Err("input_binding_failed");
    }
    if hex::decode(&packet.input.buyer_key).map_err(|_| "input_invalid")?.len() != 32 || hex::decode(&packet.input.salt).map_err(|_| "input_invalid")?.len() != 32 {
        return Err("input_invalid");
    }
    if packet.input.source_csv.len() > 10000 || packet.input.ledger_csv.len() > 10000 { return Err("input_too_large"); }
    Ok(())
}

pub fn minor_units(value: &str) -> Result<u64, &'static str> {
    let value = value.trim();
    let parts: Vec<&str> = value.split('.').collect();
    if parts.len() > 2 || parts[0].is_empty() || !parts[0].bytes().all(|b| b.is_ascii_digit()) { return Err("amount_invalid"); }
    let whole: u64 = parts[0].parse().map_err(|_| "amount_invalid")?;
    let fraction = if parts.len() == 2 {
        if parts[1].is_empty() || parts[1].len() > 2 || !parts[1].bytes().all(|b| b.is_ascii_digit()) { return Err("amount_invalid"); }
        let n: u64 = parts[1].parse().map_err(|_| "amount_invalid")?;
        if parts[1].len() == 1 { n * 10 } else { n }
    } else { 0 };
    let amount = whole.checked_mul(100).and_then(|a| a.checked_add(fraction)).ok_or("amount_invalid")?;
    if amount > 9_007_199_254_740_991 { return Err("amount_invalid"); }
    Ok(amount)
}

fn currency(value: &str) -> Result<String, &'static str> {
    let value = value.trim().to_ascii_uppercase();
    if !["USD", "EUR", "GBP"].contains(&value.as_str()) { return Err("currency_unsupported"); }
    Ok(value)
}

fn id(value: &str) -> Result<String, &'static str> {
    let value = value.trim();
    if value.is_empty() || value.len() > 80 || value.chars().any(char::is_control) { return Err("invoice_id_invalid"); }
    Ok(value.to_owned())
}

fn csv_rows(input: &str, required: &[&str]) -> Result<Vec<BTreeMap<String, String>>, &'static str> {
    let mut reader = csv::ReaderBuilder::new().trim(csv::Trim::All).from_reader(input.as_bytes());
    let headers = reader.headers().map_err(|_| "csv_invalid")?.iter().map(|s| s.trim().to_ascii_lowercase()).collect::<Vec<_>>();
    if headers.iter().collect::<BTreeSet<_>>().len() != headers.len() || !required.iter().all(|name| headers.iter().any(|h| h == name)) { return Err("csv_headers_invalid"); }
    let mut rows = Vec::new();
    for row in reader.records() {
        let row = row.map_err(|_| "csv_invalid")?;
        let values = headers.iter().cloned().zip(row.iter().map(str::to_owned)).collect();
        rows.push(values);
        if rows.len() > 16 { return Err("too_many_rows"); }
    }
    Ok(rows)
}

pub fn expected_result(input: &PrivateInput) -> Result<PrivateResult, &'static str> {
    if let Some(bank) = &input.bank {
        if bank::approved_ledger(input, bank)? != input.ledger_csv { return Err("bank_ledger_binding_failed"); }
    }
    let invoices = csv_rows(&input.source_csv, &["invoice_id", "vendor", "amount", "currency"])?;
    let payments = csv_rows(&input.ledger_csv, &["invoice_id", "amount", "currency"])?;
    if invoices.is_empty() { return Err("no_invoices"); }
    let mut ledger: BTreeMap<String, Vec<(String, u64)>> = BTreeMap::new();
    for row in payments {
        ledger.entry(id(&row["invoice_id"])?).or_default().push((currency(&row["currency"])?, minor_units(&row["amount"])?));
    }
    let mut seen = BTreeSet::new();
    let mut rows = Vec::new();
    for invoice in invoices {
        let invoice_id = id(&invoice["invoice_id"])?;
        if !seen.insert(invoice_id.clone()) { return Err("source_duplicate"); }
        let vendor = invoice["vendor"].split_whitespace().collect::<Vec<_>>().join(" ");
        if vendor.is_empty() || vendor.len() > 120 { return Err("vendor_invalid"); }
        let c = currency(&invoice["currency"])?;
        let amount = minor_units(&invoice["amount"])?;
        if amount == 0 { return Err("amount_invalid"); }
        let paid_minor = ledger.get(&invoice_id).map(|payments| payments.iter().try_fold(0u64, |sum,(_,n)| sum.checked_add(*n).ok_or("amount_invalid"))).transpose()?.unwrap_or(0);
        let status = match ledger.get(&invoice_id) {
            None => "unpaid",
            Some(payments) => {
                let mut sum = 0u64;
                let mut same_currency = true;
                for (paid_currency, paid_amount) in payments {
                    sum = sum.checked_add(*paid_amount).ok_or("amount_invalid")?;
                    same_currency &= paid_currency == &c;
                }
                if same_currency && sum == amount { "matched" } else if same_currency && sum > 0 && sum < amount { "partial" } else { "mismatch" }
            }
        };
        rows.push(ResultRow { invoice_id, vendor, amount_minor: amount, currency: c, paid_minor, remaining_minor:amount.saturating_sub(paid_minor), status: status.to_owned() });
    }
    if ledger.keys().any(|key| !seen.contains(key)) { return Err("ledger_unknown_invoice"); }
    Ok(PrivateResult { schema: "sealwork.invoice-reconciliation.v2".to_owned(), rows,
        bank: input.bank.as_ref().map(|b|b.proposal.clone()),
        payments:input.bank.as_ref().map(bank::payment_rows).transpose()?,
        sources:SourceHashes { source_sha256:digest(input.source_csv.as_bytes()), ledger_sha256:digest(input.ledger_csv.as_bytes()), payments_sha256:input.bank.as_ref().map(|b|digest(b.payments_csv.as_bytes())) } })
}

pub fn produce(input: &PrivateInput, faulty: bool) -> Result<PrivateResult, &'static str> {
    let mut result = expected_result(input)?;
    if faulty {
        // Deliberately faulty demo build. Its one-minor-unit mutation must
        // fail the independently pinned verifier, and only this build's
        // history receives the rejected outcome.
        result.rows[0].amount_minor = result.rows[0].amount_minor.checked_add(1).ok_or("amount_invalid")?;
    }
    Ok(result)
}

pub fn delivery_aad(job_id: &str, commitment: &str) -> Vec<u8> {
    format!("sealwork:delivery:v1:{}:{}", job_id, commitment).into_bytes()
}

pub fn encrypt_delivery(input: &PrivateInput, commitment: &str, plaintext: &str) -> Result<String, &'static str> {
    let key = hex::decode(&input.buyer_key).map_err(|_| "delivery_key_invalid")?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| "delivery_key_invalid")?;
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let ciphertext = cipher.encrypt(Nonce::from_slice(&nonce), Payload { msg: plaintext.as_bytes(), aad: &delivery_aad(&input.job_id, commitment) }).map_err(|_| "delivery_encryption_failed")?;
    let mut result = vec![1u8];
    result.extend_from_slice(&nonce);
    result.extend_from_slice(&ciphertext);
    Ok(STANDARD.encode(result))
}

pub fn decrypt_delivery(input: &PrivateInput, commitment: &str, ciphertext: &str) -> Result<String, &'static str> {
    let bytes = STANDARD.decode(ciphertext).map_err(|_| "delivery_invalid")?;
    if bytes.len() < 30 || bytes[0] != 1 { return Err("delivery_invalid"); }
    let key = hex::decode(&input.buyer_key).map_err(|_| "delivery_key_invalid")?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| "delivery_key_invalid")?;
    let plaintext = cipher.decrypt(Nonce::from_slice(&bytes[1..13]), Payload { msg: &bytes[13..], aad: &delivery_aad(&input.job_id, commitment) }).map_err(|_| "delivery_invalid")?;
    String::from_utf8(plaintext).map_err(|_| "delivery_invalid")
}

pub fn verify(input: &PrivateInput, commitment: &str, artifact: &Artifact) -> Result<Vec<Check>, &'static str> {
    if artifact.job_id != input.job_id || artifact.input_commitment != commitment || artifact.result_commitment != result_commitment(&artifact.result, &input.salt) { return Err("artifact_binding_failed"); }
    let expected = expected_result(input)?;
    let actual: PrivateResult = serde_json::from_str(&artifact.result).map_err(|_| "result_invalid")?;
    if actual.schema != expected.schema || actual.rows.len() > 16 { return Err("result_invalid"); }
    let actual_ids = actual.rows.iter().map(|r| &r.invoice_id).collect::<BTreeSet<_>>();
    let expected_ids = expected.rows.iter().map(|r| &r.invoice_id).collect::<BTreeSet<_>>();
    let by_id = actual.rows.iter().map(|r| (r.invoice_id.clone(), r)).collect::<BTreeMap<_, _>>();
    let matches = |which: u8| expected.rows.iter().all(|e| by_id.get(&e.invoice_id).is_some_and(|a| match which {
        0 => a.amount_minor == e.amount_minor && a.currency == e.currency && a.paid_minor == e.paid_minor && a.remaining_minor == e.remaining_minor,
        1 => a.vendor == e.vendor,
        _ => a.status == e.status,
    }));
    let delivery_matches = decrypt_delivery(input, commitment, &artifact.result_ciphertext).map(|s| s == artifact.result).unwrap_or(false);
    Ok(vec![
        Check { id: "row_count".to_owned(), passed: actual.rows.len() == expected.rows.len() },
        Check { id: "unique_ids".to_owned(), passed: actual_ids.len() == actual.rows.len() && actual_ids == expected_ids },
        Check { id: "amounts_preserved".to_owned(), passed: matches(0) },
        Check { id: "vendor_integrity".to_owned(), passed: matches(1) },
        Check { id: "ledger_matches".to_owned(), passed: matches(2) && actual.bank == expected.bank && actual.payments == expected.payments && actual.sources == expected.sources },
        Check { id: "delivery_integrity".to_owned(), passed: delivery_matches },
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn execution_can_bind_to_the_runtime_transaction_without_an_sdk_request_id() {
        let tx = "HKPL27raNxkJwYNZs6uX8xcPEai5S7aqTfD47wG9xQfF";
        assert!(validate_execution_reference(None, Some(tx)).is_ok());
        assert!(validate_execution_reference(Some("5928"), Some(tx)).is_ok());
        assert!(validate_execution_reference(Some("5928"), None).is_ok());
        assert_eq!(validate_execution_reference(None, None), Err("attested_context_missing"));
        for id in ["", "not-a-request", "123456789012345678901"] {
            assert_eq!(validate_execution_reference(Some(id), Some(tx)), Err("attested_context_invalid"));
        }
        for invalid in ["", "caller-supplied", "00000000000000000000000000000000000000000000"] {
            assert_eq!(validate_execution_reference(None, Some(invalid)), Err("attested_context_invalid"));
        }
    }
    fn input() -> PrivateInput {
        PrivateInput { job_id: "sw_11111111111111111111111111111111".to_owned(), source_csv: "invoice_id,vendor,amount,currency\nI-1,  Fern   Studio ,12.35,usd\nI-2,Northstar,80.00,EUR\nI-3,Atlas,5.00,GBP".to_owned(), ledger_csv: "invoice_id,amount,currency\nI-1,10.00,USD\nI-1,2.35,USD\nI-2,79.99,EUR".to_owned(), buyer_key: "33".repeat(32), salt: "44".repeat(32), bank: None }
    }
    fn artifact(input: &PrivateInput, faulty: bool) -> Artifact {
        let result = serde_json::to_string(&produce(input, faulty).unwrap()).unwrap();
        let c = input_commitment(input).unwrap();
        Artifact { job_id: input.job_id.clone(), input_commitment: c.clone(), manifest_hash: "55".repeat(32), result_commitment: result_commitment(&result, &input.salt), result_ciphertext: encrypt_delivery(input, &c, &result).unwrap(), result }
    }
    #[test] fn exact_money_arithmetic() {
        assert_eq!(minor_units("0.29").unwrap(),29);
        assert_eq!(minor_units("10.5").unwrap(),1050);
        for invalid in ["-1", "1e3", "1.999", "", "NaN", "99999999999999999999999999"] { assert!(minor_units(invalid).is_err()); }
    }
    #[test] fn private_packet_round_trips_without_ambiguous_flattening() {
        let i=input();let c=input_commitment(&i).unwrap();
        let packet=PrivatePacket{input:i,input_commitment:c.clone()};
        let encoded=serde_json::to_string(&packet).unwrap();
        let parsed:PrivatePacket=serde_json::from_str(&encoded).unwrap();
        assert!(validate_packet(&parsed,&parsed.input.job_id,&c).is_ok());
        let mut changed:serde_json::Value=serde_json::from_str(&encoded).unwrap();
        changed["unexpected"]=serde_json::json!(true);
        assert!(serde_json::from_value::<PrivatePacket>(changed).is_err());
    }
    #[test] fn statuses_are_recomputed_from_all_payments() {
        let r=expected_result(&input()).unwrap();
        assert_eq!(r.rows.iter().map(|r|r.status.as_str()).collect::<Vec<_>>(),vec!["matched","partial","unpaid"]);
        assert_eq!(r.rows[0].vendor,"Fern Studio");
        assert_eq!((r.rows[1].paid_minor,r.rows[1].remaining_minor),(7999,1));
    }
    #[test] fn honest_and_faulty_builds_are_distinguished() {
        let i=input();let c=input_commitment(&i).unwrap();
        assert!(verify(&i,&c,&artifact(&i,false)).unwrap().iter().all(|c|c.passed));
        let checks=verify(&i,&c,&artifact(&i,true)).unwrap();
        assert!(!checks.iter().find(|c|c.id=="amounts_preserved").unwrap().passed);
        assert!(checks.iter().find(|c|c.id=="delivery_integrity").unwrap().passed);
    }
    #[test] fn duplicate_rows_cannot_pass() {
        let i=input();let c=input_commitment(&i).unwrap();let mut a=artifact(&i,false);
        let mut r:PrivateResult=serde_json::from_str(&a.result).unwrap();r.rows[1]=r.rows[0].clone();
        a.result=serde_json::to_string(&r).unwrap();a.result_commitment=result_commitment(&a.result,&i.salt);
        a.result_ciphertext=encrypt_delivery(&i,&c,&a.result).unwrap();
        assert!(!verify(&i,&c,&a).unwrap().iter().find(|c|c.id=="unique_ids").unwrap().passed);
    }
    #[test] fn passing_plaintext_with_a_different_delivery_is_rejected() {
        let i=input();let c=input_commitment(&i).unwrap();let mut a=artifact(&i,false);
        a.result_ciphertext=encrypt_delivery(&i,&c,"a different, unusable delivery").unwrap();
        assert!(!verify(&i,&c,&a).unwrap().iter().find(|c|c.id=="delivery_integrity").unwrap().passed);
    }
    #[test] fn delivery_is_bound_to_job_and_source() {
        let i=input();let c=input_commitment(&i).unwrap();let a=artifact(&i,false);let mut other=i.clone();other.job_id.push('2');
        assert!(decrypt_delivery(&other,&c,&a.result_ciphertext).is_err());
        assert!(decrypt_delivery(&i,&"00".repeat(32),&a.result_ciphertext).is_err());
        assert!(verify(&other,&c,&a).is_err());
    }
    #[test] fn tampering_is_detected_and_encryption_is_randomized() {
        let i=input();let c=input_commitment(&i).unwrap();let a=artifact(&i,false);
        assert_ne!(a.result_ciphertext,encrypt_delivery(&i,&c,&a.result).unwrap());
        let mut bytes=STANDARD.decode(&a.result_ciphertext).unwrap();let n=bytes.len();bytes[n-1]^=1;
        assert!(decrypt_delivery(&i,&c,&STANDARD.encode(bytes)).is_err());
    }
    #[test] fn the_input_commitment_includes_the_delivery_key() {
        let i=input();let mut changed=i.clone();changed.buyer_key="99".repeat(32);
        assert_ne!(input_commitment(&i).unwrap(),input_commitment(&changed).unwrap());
    }
    #[test] fn quoted_unicode_vendors_and_invalid_source_are_handled() {
        let mut i=input();i.source_csv="invoice_id,vendor,amount,currency\nI-1,\"Fern, café\",12.35,USD".to_owned();
        i.ledger_csv="invoice_id,amount,currency\nI-1,12.35,USD".to_owned();
        assert_eq!(expected_result(&i).unwrap().rows[0].vendor,"Fern, café");
        i.source_csv.push_str("\nI-1,Fern,12.35,USD");assert_eq!(expected_result(&i).unwrap_err(),"source_duplicate");
        i.source_csv="invoice_id,vendor,amount,currency\nI-1,Fern,12.35,JPY".to_owned();assert_eq!(expected_result(&i).unwrap_err(),"currency_unsupported");
    }
    #[test] fn unknown_ledger_rows_cannot_disappear_from_a_paid_report() {
        let mut i=input();i.ledger_csv.push_str("\nUNKNOWN,5.00,USD");
        assert_eq!(expected_result(&i).unwrap_err(),"ledger_unknown_invoice");
    }
    #[test] fn fabricated_outstanding_balances_and_source_hashes_fail_verification() {
        let i=input();let c=input_commitment(&i).unwrap();let mut a=artifact(&i,false);
        let mut r:PrivateResult=serde_json::from_str(&a.result).unwrap();r.rows[1].remaining_minor=0;
        r.sources.source_sha256="00".repeat(32);
        a.result=serde_json::to_string(&r).unwrap();a.result_commitment=result_commitment(&a.result,&i.salt);
        a.result_ciphertext=encrypt_delivery(&i,&c,&a.result).unwrap();
        let checks=verify(&i,&c,&a).unwrap();
        assert!(!checks.iter().find(|c|c.id=="amounts_preserved").unwrap().passed);
        assert!(!checks.iter().find(|c|c.id=="ledger_matches").unwrap().passed);
    }
}
