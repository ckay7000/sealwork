# Private bank payment matching

Sealwork now proposes matches from bank descriptions, supports combined payments, preserves uncertainty, and independently checks allocations against the original records. Open [private bank matching](https://sealwork.vercel.app/new?task=bank&mode=agent). The built-in records are fictional.

A $900 Northstar April payment can cover two invoices of $500 and $400. A $250 Fern payment with two equally plausible $250 invoices remains **needs review**, with no allocation. The buyer reviews all proposals before funding the report-processing job.

## Data and execution

1. The browser obtains a fresh NEAR AI Cloud attestation using a random 32-byte nonce.
2. Local DCAP verification checks gateway and every model candidate, Intel signatures and collateral, `UpToDate` TCB status, debug exclusion, nonce/key binding, measured configuration, and RTMR3 replay. Exact measured configurations are pinned in `shared/ai-policy.json`. The only allowed configuration variation is the nonsecret instance label, `gpu01` through `gpu16`.
3. The server submits the nonce-bound GPU payload to NVIDIA NRAS over HTTPS and requires a positive verdict. This follows NEAR's TLS-authenticated NRAS policy; it is not local verification of NVIDIA's JWT signature.
4. The browser encrypts the prompt and records to the verified Ed25519 model key using X25519, HKDF-SHA256 and XChaCha20-Poly1305. Sealwork's server forwards ciphertext and public keys. The API rejects plaintext financial fields, tools, model changes, streaming and larger token budgets.
5. The browser retains the exact encrypted request and response bytes. It verifies an Ed25519 `provider_tee` signature over `MODEL:SHA256(request):SHA256(response)` against exactly one retained preflight report. A gateway signature is insufficient for this workflow. Only then does it decrypt and validate the proposal.
6. After buyer approval, original invoices, original bank records, the proposal and its derived ledger are encrypted into a job-bound OutLayer packet. The independent Rust verifier repeats allocation rules from those original records and checks the encrypted final report. A changed report is rejected; invalid source allocations cannot earn payment.

The six escrow check IDs remain compatible with the existing contract. Bank allocation and evidence rules extend the `ledger_matches` check. New binary hashes and an isolated escrow separate this behavior from previous deployments. Previous receipts remain readable.

## Acceptance rules

- Every bank payment must have exactly one decision; source IDs are unique and cannot be invented.
- Proposed allocations use positive integer cents, preserve currency, and sum to the entire payment.
- Payments cannot be duplicated, and cumulative allocations cannot exceed any invoice's amount.
- Each proposed match cites an exact substring from its original bank description.
- Review and unmatched decisions have no allocations and remain visible in the private report.
- The approved ledger, invoice statuses, proposal, and encrypted delivery must agree with the original packet.

These rules establish consistency. They do not prove what a payer intended or whether an invoice represents a genuine obligation. The buyer must review proposed semantic matches. Invoice rows left unpaid are accompanied by the bank decisions, including unresolved payments.

Limits: 16 invoices, 16 bank payments, 16 allocations in total, USD/EUR/GBP, and 5 KB of combined CSVs for private inference. The deterministic report path retains its 10 KB per-file limit.

## Payment and evidence boundaries

NEAR AI Cloud bills inference separately, before report escrow is funded. Conditional payment applies to the OutLayer worker's **0.050 testnet NEAR report-processing fee**. A report that correctly leaves ambiguous payments unresolved can pass and receive that fee.

Model instances share signing keys. A verified key and response signature do **not** establish that the report and response came from one unique serving instance. The pinned model configuration measures its management environment; this is not an independent audit of model weights or every dynamically launched process. See the [NEAR model evidence limits](https://docs.near.ai/cloud/verification/cloud-api/model-attestations) and [response-signature limits](https://docs.near.ai/cloud/verification/cloud-api/response-signatures).

Model evidence digests and the signed text stay in the buyer's private recovery file. Original bank data and decisions are not in the public receipt. The browser's code delivery, HTTPS endpoints, OutLayer keystore and execution infrastructure, and dedicated testnet sponsor remain trust dependencies. Warm-instance request limits are not a global inference billing cap; use prepaid credits.

## Verification

`npm test` includes real captured Intel quotes and adversarial nonce, signing-key, event-log, configuration, signature-byte and allocation tests. `cargo test --locked --manifest-path workers/Cargo.toml --jobs 1` checks the independent Rust acceptance path.

`npm run test:browser-live -- --bank` performs real encrypted inference, verifies its signature, approves and funds the report, tests faulty-report and invalid-allocation refunds, and checks private recovery and public receipt privacy. It consumes sponsored testnet jobs and a small amount of configured model credits. Its public report is written to ignored `reports/bank-live.json`; recovery files stay in ignored `.local/`.
