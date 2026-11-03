# Verification status

Observed November 3, 2026. Tests are implementation evidence, not a security audit or customer validation.

## Completed checks

- **65 application tests** passed, including ambiguous matching, allocation limits, currency totals, CSV exports and report parsing.
- **18 Rust worker/verifier tests** passed, including forged balances/source fingerprints, altered unresolved receipts and unknown ledger references.
- **18 NEAR escrow sandbox tests** passed: accepted payment, rejected work, forged callbacks, invalid bindings, deadline refunds, failed-admission compute return and exactly-once failed-transfer recovery.
- Four current WASM workers/verifier compiled. The frontend production build passed.
- A fresh hosted, manually reviewed bank batch completed: [verified and paid receipt](https://sealwork-next.vercel.app/jobs/sw_738acb849746cb7198291abb6f392be3). The browser checked the v2 report, original/approved proposal fingerprints, invoice CSV, bank-receipt CSV, private reconciliation pack, recovery in a separate page and both execution fingerprints. No page errors were recorded. The private pack excludes the delivery key.
- A fresh deliberately faulty worker was [rejected and refunded](https://sealwork-next.vercel.app/jobs/sw_e86fb3a2d9e154854be2fb07ced52b66).
- The interrupted first job was [expired and refunded](https://sealwork-next.vercel.app/jobs/sw_0539cd8e51f1ef265868525e94721a69). It consumed an admitted worker execution; refund covers the worker fee and the unused reserved verifier compute. OutLayer separately returns unused admitted compute to its payer.

- A fresh hosted timeout workflow clicked **Request deadline refund** and confirmed [expired and refunded](https://sealwork-next.vercel.app/jobs/sw_7414b418fe7573e983807983f900ab47), with no browser page errors.

## Gas-budget correction found by the hosted test

The first new bank job's worker completed successfully, but the `on_agent_result` callback exceeded prepaid gas while scheduling the verifier for the larger result. Transaction: [`428psBjA1pVvpY17JPfGhJwqVR1YzE2ykaD7vaUxQmre`](https://testnet.nearblocks.io/txns/428psBjA1pVvpY17JPfGhJwqVR1YzE2ykaD7vaUxQmre). The new deployment now allocates **80 Tgas to each OutLayer request and 200 Tgas to the agent-result callback**, preserving space for the verifier call under NEAR's transaction ceiling.

Only `market.sealwork-next-1103.testnet` was upgraded, without changing storage layout: [`HBLGyX4r7gqrHPwPu5BAPBJPm6Qh7PhydtkXz7WynPAu`](https://testnet.nearblocks.io/txns/HBLGyX4r7gqrHPwPu5BAPBJPm6Qh7PhydtkXz7WynPAu). The subsequent reviewed batch passed and paid. The original Sealwork contract, source and site were preserved.

The sandbox fixture now exercises the largest allowed 32,000-character agent envelope and 12,000-character buyer delivery. The targeted rerun could not complete: starting a new local NEAR sandbox exhausted the Node heap, including a direct attempt without Vitest. It is not counted as passed. The earlier 18-case sandbox run completed, and the new gas allocation was verified by the subsequent real bank and private-AI payments. Maximum-envelope coverage remains a stated local verification limit.

## Browser coverage and limits

The review/edit/approval-invalidation test and desktop/390px/320px page layout checks passed. The icon-only search button now has an explicit accessible name. Mobile layouts intentionally hide workspace search; the interaction check uses the desktop layout. The optional private-AI path also passed in a fresh [paid batch](https://sealwork-next.vercel.app/jobs/sw_ecc167bf4b0b981b881cf78e56e12649): model-response evidence, manual review provenance, exports and recovery were checked. The final hosted layout and search/fingerprint-reset check passed on the current deployment; page widths 1440, 390 and 320 were checked.

The workspace later denied browser process startup, and automatic approval review rejected sandbox escalation. Hosted checks use an authenticated temporary browser service and fictional records. Original Sealwork videos and inherited examples are baseline evidence and do not prove execution of this version's binaries. The current source for hosted checks is [the reusable browser script](../scripts/demo-capture/sealwork-next.ts).

The verifier checks consistency with supplied records and approved allocations. It does not prove invoice authenticity, bank provenance, payer intent or accounting compliance. Worker and verifier execute separately but share Rust reconciliation logic. Sponsored signers, contract upgrade authority and confidential-compute infrastructure remain trust boundaries.
