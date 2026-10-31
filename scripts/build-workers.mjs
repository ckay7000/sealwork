import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rootId = process.env.SEALWORK_ROOT_ID || "sealwork-lab.testnet";
if (!rootId.endsWith(".testnet"))
  throw new Error("This deployment recipe is testnet only.");
const contract = `market.${rootId}`;
const sourceDigest = digest(
  Buffer.concat(
    await Promise.all(
      [
        "workers/src/main.rs",
        "workers/src/lib.rs",
        "workers/Cargo.toml",
        "workers/Cargo.lock",
        "workers/rust-toolchain.toml",
      ].map((f) => readFile(f)),
    ),
  ),
);
const specs = [
  {
    feature: "ledgerline-v1",
    agent_id: "ledgerline",
    name: "Ledgerline",
    version: "1.0",
    provider_id: `ledgerline.${rootId}`,
    description:
      "Reconcile confidential invoices against a payment ledger, with exact amount and currency checks.",
  },
  {
    feature: "ledgerline-v2",
    agent_id: "ledgerline",
    name: "Ledgerline",
    version: "1.1",
    provider_id: `ledgerline.${rootId}`,
    description:
      "A deliberately faulty demo update that changes one amount. Its results belong to a separate build history.",
  },
  {
    feature: "archivist-v1",
    agent_id: "archivist",
    name: "Archivist",
    version: "1.0",
    provider_id: `archivist.${rootId}`,
    description:
      "Turn private invoice and ledger files into a structured reconciliation report checked before payment.",
  },
  {
    feature: "verifier",
    agent_id: "sealwork-verifier",
    name: "Sealwork acceptance verifier",
    version: "1.0",
    provider_id: contract,
    description:
      "Independently checks completeness, identifiers, amounts, vendors, payment statuses, and encrypted delivery.",
  },
];
await mkdir("workers/manifests/build", { recursive: true });
await mkdir("workers/manifests/runtime", { recursive: true });
await mkdir("public/wasm", { recursive: true });
await mkdir("public/manifests", { recursive: true });
await mkdir("deployments", { recursive: true });
const built = [];
for (const spec of specs) {
  const runtimeManifest = {
    display: { name: `${spec.name} ${spec.version}` },
    operations: [spec.feature === "verifier" ? "verify" : "run"],
    capabilities: { network: [] },
    callers: { contract: { only: [contract] } },
    encryption_keys: [
      { path: "results", bind: "project", caller: "predecessor" },
    ],
  };
  const runtimeBytes = JSON.stringify(runtimeManifest, null, 2) + "\n";
  const buildManifest = {
    protocol: "sealwork.build.v1",
    agent_id: spec.agent_id,
    name: spec.name,
    version: spec.version,
    engine: {
      kind: "deterministic",
      recipe: "invoice-reconciliation/v1",
      source_digest: sourceDigest,
      feature: spec.feature,
    },
    model: null,
    system_prompt: null,
    permissions: {
      network: [],
      private_inputs: "job-bound",
      outputs: "encrypted-delivery-only",
    },
    runtime_manifest_hash: digest(Buffer.from(runtimeBytes)),
    compiler: { version: "rustc 1.90.0", target: "wasm32-wasip2" },
    faulty_demo_build: spec.feature === "ledgerline-v2",
  };
  const manifestBytes = JSON.stringify(buildManifest, null, 2) + "\n";
  await writeFile(
    `workers/manifests/build/${spec.feature}.json`,
    manifestBytes,
  );
  await writeFile(
    `workers/manifests/runtime/${spec.feature}.json`,
    runtimeBytes,
  );
  const cargo = process.env.SEALWORK_CARGO || "cargo";
  const registry = path.join(
    process.env.CARGO_HOME || path.join(process.env.HOME || "", ".cargo"),
    "registry",
  );
  await new Promise((resolve, reject) => {
    const child = spawn(
      cargo,
      [
        "build",
        "--locked",
        "--target",
        "wasm32-wasip2",
        "--release",
        "--no-default-features",
        "--features",
        spec.feature,
        "--jobs",
        "1",
      ],
      {
        cwd: path.resolve("workers"),
        stdio: "inherit",
        env: {
          ...process.env,
          SOURCE_DATE_EPOCH: "0",
          CARGO_INCREMENTAL: "0",
          RUSTFLAGS: [
            process.env.RUSTFLAGS || "",
            "--remap-path-prefix=" +
              path.resolve("workers") +
              "=/sealwork/workers",
            "--remap-path-prefix=" + registry + "=/cargo/registry",
          ]
            .filter(Boolean)
            .join(" "),
        },
      },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Worker build failed: " + spec.feature)),
    );
  });
  const target = process.env.CARGO_TARGET_DIR
    ? path.resolve(process.env.CARGO_TARGET_DIR)
    : path.resolve("workers/target");
  const binaryPath = path.join(
    target,
    "wasm32-wasip2/release/sealwork-worker.wasm",
  );
  const binary = await readFile(binaryPath);
  const hash = digest(binary);
  await copyFile(binaryPath, `public/wasm/${hash}.wasm`);
  await writeFile(
    `public/manifests/${digest(Buffer.from(manifestBytes))}.json`,
    manifestBytes,
  );
  built.push({
    ...spec,
    hash,
    manifest_hash: digest(Buffer.from(manifestBytes)),
    source_digest: sourceDigest,
    bytes: binary.length,
  });
  console.log(
    `Built ${spec.name} ${spec.version}: ${hash} (${binary.length} bytes)`,
  );
}
await writeFile(
  "deployments/builds.json",
  JSON.stringify(
    {
      compiler: "rustc 1.90.0",
      target: "wasm32-wasip2",
      contract_id: contract,
      project_id: `${rootId}/sealwork`,
      source_digest: sourceDigest,
      builds: built,
    },
    null,
    2,
  ) + "\n",
);
