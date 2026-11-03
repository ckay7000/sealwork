# Sealwork Next: focused improvement plan

Requested November 3, 2026. This is a separate development repository for comparison with the original Sealwork. The original repository and production site must remain available.

## Customer and problem

The first customer is a bookkeeper matching bank receipts to invoices. The product must reduce reconciliation work while keeping ambiguity visible and sensitive records private. Its output is a reviewed, independently checked reconciliation report. The processing fee is separate from the bank amounts.

## Work sequence

1. Verify current official hackathon rules, track prompts, NEAR capabilities and positioning, judges' published backgrounds, and competitors named by the user. Record sources and distinguish claims from observations.
2. Audit the existing reconciliation workflow and its checks. Identify meaningful customer and correctness gaps before changing it.
3. Implement a focused import, review, verification and export workflow in this repository. Explain material decisions as work proceeds.
4. Verify business behavior, privacy boundaries, contract settlement, the production build and actual hosted workflows. Publish a separate repository and deployment with explicit reuse disclosure.
5. Compare the old and new Sealwork and record remaining limits. Then complete Accord as a separate contractor-payment product.

## Acceptance criteria

- Realistic bank and invoice records can be imported and validated without silent loss or numeric rounding.
- Proposed matches show their evidence. Ambiguous records remain exceptions until the user resolves them.
- Allocations cannot double-use funds, overpay invoices or cross currencies.
- The reviewed decision and independent verification refer to the same records and allocations.
- Exported reports provide useful accounting totals, unresolved items and source fingerprints, with private contents kept out of public receipts.
- A passing job pays its worker fee; rejected or expired work follows the documented refund rules.
- The new repository and deployment identify the original baseline and actual changes. They do not imply two independent Sealwork entries are permitted.
- Customer feedback is not fabricated, and tests are not represented as a security audit.

## Status

Research and implementation audit in progress. Features above are acceptance targets, not completion claims.
