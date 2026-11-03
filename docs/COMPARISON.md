# Original Sealwork compared with this version

Original baseline: [`bc4e40289b6b1a964b39ad1a7c2d309b93bf809c`](https://github.com/NSEVEjk0/sealwork/commit/bc4e40289b6b1a964b39ad1a7c2d309b93bf809c).

The original source checkout and site are preserved. This new repository is a derivative comparison version of the same product, not a second independent hackathon entry. Its public repository snapshot discloses that baseline; the local checkout retains original Git history. The author also works on the independent Accord product.

| Area | Original baseline | New version |
| --- | --- | --- |
| Primary workflow | Private bank suggestions and worker payment | Import, suggestions, editable review, checked balances and exports |
| Suggestions | Private AI | Optional local exact-reference/amount matching plus existing private AI |
| Ambiguity | Preserved as needs review | Filterable queue; resolve allocations with a reason or keep unresolved |
| Approval | Proposal approval | Editing clears approval; original and approved proposal fingerprints retained privately |
| Partial invoices | Aggregate status | Allocated and outstanding amounts; partial-payment status |
| Bank receipts in output | Decisions in private report | Checked source receipt records with received, allocated and unresolved amounts |
| Source identity | Input commitment binds private packet | Additionally includes separate invoice/ledger/bank CSV SHA-256 fingerprints |
| Unknown ledger invoice | Could disappear during report generation | Refused before funding and by Rust processing |
| Exports | Invoice CSV and decisions | Expanded invoice CSV, bank-receipt CSV and private reconciliation JSON pack |
| Spreadsheet text | Plain CSV text | Formula-leading cells neutralized; original values remain in JSON |
| Batch size | Input limits | Expanded encrypted-output preflight against the existing contract's 12,000-character bound |
| Callback gas | Original allocation failed on the expanded bank report | Rebalanced request/callback gas; subsequent bank job paid |
| Testnet state | Original accounts/contract/worker histories | Separate accounts, contract and four current build fingerprints |
| Video | Original narrated and continuous recordings | Original recordings explicitly labeled baseline; current checks documented separately |

## Compare with the same fictional inputs

Open [original bank matching](https://sealwork.vercel.app/new?task=bank) and [new bank matching](https://sealwork-next.vercel.app/new?task=bank).

In the new version, use **Suggest exact matches locally**. PAY-01 should allocate $500 and $400, PAY-02 should remain ambiguous, PAY-03 should match $125, and PAY-04 should stay unmatched. Review PAY-02, choose the correct invoice only if the fictional description is enough for your decision, supply a reason, and apply it. The allocated/unresolved totals change; final approval is cleared whenever you edit. Keeping it unresolved is a valid outcome.

A completed new job provides invoice and receipt CSV exports. Compare allocated/outstanding balances and unresolved receipts. The private JSON pack binds these outputs to the exact source files and reviewed proposal. Never publish recovery files or delivery keys. This comparison uses fictional inputs and testnet processing fees, not real bank settlement.

## Boundaries

The verifier checks consistency, not whether invoices are authentic or payment descriptions sufficient. Manual approval is the bookkeeper's decision. A TEE-signed original AI proposal does not authenticate later edits. Separate worker/verifier executions still share reconciliation code and are not an independent security audit. This is a bounded CSV prototype, not a bank connection, full accounting ledger or production deployment.
