> Inherited reference from the original Sealwork baseline. Deployment IDs, screenshots, counts and recordings on this page may refer to the original version. See [current behavior](../README.md), [comparison](COMPARISON.md) and [current verification](VERIFICATION.md).

# Develop and verify Sealwork

## Credential-free app checks

Use Node 24 and npm:

```bash
npm ci
npm test
npm run build
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:5190. Public RPC reads work without a signer. AI inference and sponsored writes require your own isolated testnet configuration. CI repeats the unit tests and production build.

## Browser scenarios

```bash
npx playwright install chromium
npm run test:e2e
```

These tests deliberately simulate API responses for failure and recovery cases. They verify UI behavior, not hardware execution or real settlement.

## Contract and worker tests

```bash
npm ci --prefix contracts/market
npm run test:contract
cargo test --locked --manifest-path workers/Cargo.toml --jobs 1
```

Contract tests start a disposable local NEAR sandbox with an OutLayer fixture. The fixture is not a TEE. Workers use Rust 1.90.0; see `workers/rust-toolchain.toml` and the pinned lockfile. Build with the `wasm32-wasip2` target:

```bash
npm run build:contract
npm run build:workers
```

Compare generated hashes with `deployments/builds.json` and public manifests. Compiler tooling and dependencies require network access on first installation.

## Your own testnet deployment

Read [ENGINEERING.md](ENGINEERING.md) and [PRIVATE_AI.md](PRIVATE_AI.md) before configuring. `scripts/create-testnet.mjs` provisions isolated testnet accounts; `scripts/setup-env.mjs` writes ignored local settings. Contract deployment without `--apply` previews the operation. Keep buyer signing keys and `SEALWORK_CONTROL_SECRET` out of Git. The sponsor must never hold real customer funds in this prototype.

Private AI uses `NEAR_AI_API_KEY`; prepaid credits and inference limits are separate from the onchain job allowance. The planning model gets public build history, while bank analysis has a separate encrypted-input protocol.

## Genuine hosted checks

With your own configured deployment, `npm run test:live` and `npm run test:browser-live` exercise real jobs and settlement. `scripts/test-bank-live.ts` covers the full private bank workflow. They consume testnet sponsor allowance and inference credits; do not confuse them with credential-free CI. Reports go under ignored `reports/`; private delivery recovery stays under ignored `.local/`.

[Public demo capture evidence](../deployments/demo-capture.json) records the practical video’s real workflow. Existing receipt links in the README remain inspectable without credentials. Tests, binary comparisons and receipt inspection are not a security audit.
