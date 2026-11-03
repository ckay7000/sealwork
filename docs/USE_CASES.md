> Inherited reference from the original Sealwork baseline. Deployment IDs, screenshots, counts and recordings on this page may refer to the original version. See [current behavior](../README.md), [comparison](COMPARISON.md) and [current verification](VERIFICATION.md).

# Sealwork: examples and product scope

## Combined bank payment — implemented

A bookkeeper sees a $900 payment with a messy description. Two fictional invoices total $500 and $400. Private NEAR AI inference proposes allocating the payment across those invoices and explains its evidence. An ambiguous $250 payment stays unallocated and Needs review. The buyer reviews the proposal before reserving the worker’s budget.

A deterministic Rust verifier then checks the original records, integer-cent arithmetic, invoice and payment references, currency, allocation limits, coverage and encrypted delivery. It does not simply accept the model’s confidence score. The conditional fee is 0.050 testnet NEAR; the fictional $900 is never moved onchain.

## Faulty agent update — implemented

The deliberately faulty Ledgerline 2.1 demo changes an amount. The separate verifier rejects the result, escrow refunds the agent budget, and the failed outcome belongs to 2.1’s executable hash. Ledgerline 2.0 retains its separate history. A version label alone is insufficient: the agreement pins exact executable and verifier fingerprints.

## Missed delivery deadline — implemented

A demo job intentionally skips execution. After the deadline, the buyer can trigger a refund. The receipt preserves the timeout outcome and transfer status. Refunds exclude consumed execution and persistent storage costs.

## Private receipt review — implemented

A reviewer opens the public job URL and inspects budget, hashes, execution references and settlement. They cannot read the private report without the buyer’s recovery file. That file contains access material and must not be published with the public receipt.

## Wider agent procurement — future expansion

The protocol could handle other objectively checkable tasks: validated data transforms, constrained exports or compliance-format reports. Each needs its own independently reviewed acceptance rules and verifier. Open permissionless agent registration, fiat payment rails and production institutional onboarding are not implemented.

This is record consistency, not fraud detection or legal assurance. AI hiring is an offchain planning decision using public build history; it has no payment key and does not override verification.

## Hiring availability is policy-dependent

The strict “previously accepted” option refuses a catalog with no accepted build free of rejection/execution-error history. Balanced hiring can choose an independently reviewed, unproven build with no such failures. It does not waive verification or claim that the build has prior accepted work. The practical demo uses this existing policy option.
