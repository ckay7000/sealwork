# Check a Sealwork receipt yourself

You can inspect payment evidence without a wallet, private key or financial report.

## In your browser

Open a [real paid bank job](https://sealwork.vercel.app/jobs/sw_ff38ff3fb1bffdbe977722e432bfc5e2). Click **Check receipt directly against NEAR**, then **Check directly against NEAR**.

The page reads the public testnet RPC directly rather than using Sealwork's jobs API. It reads the job at a finalized block, then the registered worker and contract settings at that exact block. It downloads the worker and verifier files and computes their SHA-256 fingerprints. Export the report to preserve the block and checks.

## From your own checkout

After installing the repository's dependencies, run:

```bash
node --import tsx scripts/verify-receipt.ts sw_ff38ff3fb1bffdbe977722e432bfc5e2
node --import tsx scripts/verify-receipt.ts sw_ff38ff3fb1bffdbe977722e432bfc5e2 --json
```

Use the receipt's original contract when checking a different deployment:

```bash
node --import tsx scripts/verify-receipt.ts JOB_ID --contract ACCOUNT.testnet
```

`--rpc HTTPS_URL` selects another compatible NEAR testnet RPC. `--site HTTPS_URL` selects the site publishing the hash-addressed `/wasm/` files. A failed read or inconsistent receipt returns a nonzero exit status. RPC outages are reported as errors, never converted into a pass.

## What is checked?

- Job identity and the registered worker/provider agreement.
- Valid worker, verifier, input and manifest fingerprints; contract-pinned verifier.
- Permanent outcome and exact recorded acceptance checks.
- Finished payment or refund to the correct recipient, covering the reserved worker budget.
- Outcome timing against the deadline and committed encrypted delivery where required.
- Downloaded worker and verifier bytes against the onchain SHA-256 fingerprints.

These are **public consistency checks**. They do not recompute private financial work, establish source-document authenticity or perform full hardware-quote verification. The report explicitly sets `hardware_quote_verified` and `private_result_recomputed` to `false`.

For OutLayer evidence, inspect both execution cards on the original receipt and follow their attestation links. For the contract rules, review [`contracts/market/src/index.ts`](../contracts/market/src/index.ts). The checker is in [`shared/receipt-check.ts`](../shared/receipt-check.ts), with meaningful altered-receipt and substituted-code tests in [`tests/unit/receipt-check.test.ts`](../tests/unit/receipt-check.test.ts).

The RPC response, installed application dependencies, contract deployment and retained upgrade authority remain trust dependencies. A matching executable fingerprint identifies bytes; it does not establish that their logic is correct or audited.
