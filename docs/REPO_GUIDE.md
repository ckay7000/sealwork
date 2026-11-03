> Inherited reference from the original Sealwork baseline. Deployment IDs, screenshots, counts and recordings on this page may refer to the original version. See [current behavior](../README.md), [comparison](COMPARISON.md) and [current verification](VERIFICATION.md).

# Sealwork: a guide to this repository

## Read this first

Sealwork is a private assistant for checking financial records. It helps a bookkeeper work out which invoices a bank payment covers. The bookkeeper reviews the suggestion, and a separate program checks the final report before the worker is paid.

For example, a customer sends **$900** for two invoices worth **$500 and $400**. Sealwork proposes that match. A **$250** payment could refer to more than one invoice, so it stays **Needs review**. Guessing would make the accounts look settled when they are not.

The dollars are fictional examples. The separate **0.050 testnet NEAR** fee pays for the processing job. This app does not move bank dollars.

## Who does what?

| Role | Plain explanation |
| --- | --- |
| Buyer / bookkeeper | Reviews the files, proposed matches, checks and worker fee before approving |
| Hiring agent | Recommends a worker within the buyer's rules; cannot spend the buyer's funds |
| Private AI | Suggests matches from encrypted financial input |
| Worker | Produces a report using the approved rules |
| Separate verifier | Checks supplied-record consistency; the worker cannot approve its own report |
| NEAR contract | Holds the reserved fee and records the payment or refund |

## Words you will see

- **Escrow:** the fee is reserved until the agreed conditions are checked.
- **Build / fingerprint:** one version of a worker's code and its SHA-256 identifier. A code update gets a separate success history.
- **Attestation:** execution evidence supplied by OutLayer about the code that ran. Full hardware verification is a separate check.
- **Receipt:** a public record of the agreement, checks and payment outcome. It excludes readable financial files.
- **Recovery file:** private access material needed to read the encrypted delivery on another browser. Keep it private.
- **Testnet:** a blockchain testing network. Its demo tokens are not real money.

## Pick the right document

| You want to… | Open… |
| --- | --- |
| Try the app | [README](../README.md) or [live bank workflow](https://sealwork.vercel.app/new?task=bank&mode=agent) |
| Watch a concrete example | [Demo and recording evidence](DEMO.md) |
| Check a public receipt yourself | [Verify a job](VERIFY_A_JOB.md) |
| Understand customer examples | [Use cases](USE_CASES.md) |
| Test with a bookkeeper | [User-test worksheet](USER_TEST.md) |
| Review the architecture and trust boundaries | [Engineering](ENGINEERING.md) |
| Run or modify the code | [Development](DEVELOPMENT.md) |
| Prepare for the hackathon | [Alignment](HACKATHON_ALIGNMENT.md), [official guide](HACKATHON.md), [human checklist](SUBMISSION_CHECKLIST.md) |

## Where the code lives

`src/` is the visible website. `server/` and `api/` connect it to bounded demo services. `shared/` contains formats, encryption and the public receipt checker. `workers/` contains the Rust worker and separate verifier. `contracts/market/` holds the NEAR payment rules. `tests/` checks behavior. `deployments/` contains public evidence, rather than private keys.

The current checks establish consistency with supplied records. They cannot establish that a real invoice is genuine or that an ambiguous payment has been identified correctly. The demo is a working prototype, with sponsored services and retained contract upgrade authority; it is not an audited accounting or payments service.
