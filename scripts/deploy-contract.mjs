import { Account, JsonRpcProvider, actions } from "near-api-js";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const built = JSON.parse(await readFile("deployments/builds.json", "utf8"));
const binary = await readFile("contracts/market/build/market.wasm");
const minimumMarketBalance = (BigInt(binary.length) + 8192n) * 10n ** 19n;
const site = process.env.SEALWORK_SITE_URL;
if (!site || new URL(site).protocol !== "https:")
  throw new Error("Set SEALWORK_SITE_URL to the published HTTPS website.");
const verifier = built.builds.find((build) => build.feature === "verifier");
const wasmUrl = (build) => new URL(`/wasm/${build.hash}.wasm`, site).href;
const plan = {
  network: "testnet",
  contract_id: built.contract_id,
  project_id: built.project_id,
  verifier_hash: verifier.hash,
  builds: built.builds.map((build) => ({
    hash: build.hash,
    url: wasmUrl(build),
  })),
  daily_sponsored_limit: Number(process.env.SEALWORK_DAILY_LIMIT || 12),
  contract_bytes: binary.length,
  minimum_market_balance: minimumMarketBalance.toString(),
};
if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}
const accounts = JSON.parse(
  await readFile(
    process.env.SEALWORK_ACCOUNTS_FILE || ".local/testnet-accounts.json",
    "utf8",
  ),
);
for (const role of ["root", "contract", "buyer", "ledgerline", "archivist"])
  if (!accounts[role]?.account_id?.endsWith(".testnet"))
    throw new Error(
      "Every deployment identity must be a dedicated testnet account.",
    );
if (
  accounts.contract.account_id !== built.contract_id ||
  `${accounts.root.account_id}/sealwork` !== built.project_id
)
  throw new Error(
    "The account identities and compiled manifests do not match.",
  );
const rpcUrl = process.env.SEALWORK_RPC_URL || "https://test.rpc.fastnear.com";
const rpc = new JsonRpcProvider({ url: rpcUrl });
const root = new Account(
  accounts.root.account_id,
  rpc,
  accounts.root.secret_key,
);
const market = new Account(
  accounts.contract.account_id,
  rpc,
  accounts.contract.secret_key,
);
const initialMarketState = await rpc.query({
  request_type: "view_account",
  account_id: built.contract_id,
  finality: "final",
});
if (BigInt(initialMarketState.amount) < minimumMarketBalance)
  throw new Error("Fund the dedicated escrow account for its contract storage before publishing the registry. The deployment preview shows the minimum balance.");
const outlayer = "outlayer.testnet";
async function view(receiver, method, args = {}) {
  const result = await rpc.query({
    request_type: "call_function",
    account_id: receiver,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    finality: "final",
  });
  if (!Array.isArray(result.result))
    throw new Error("Unexpected public contract response.");
  return JSON.parse(Buffer.from(result.result).toString("utf8"));
}
async function send(signer, receiver, transactionActions) {
  const result = await signer.signAndSendTransaction({
    receiverId: receiver,
    actions: transactionActions,
    waitUntil: "FINAL",
  });
  if (typeof result.status === "object" && "Failure" in result.status)
    throw new Error(
      "A deployment transaction failed. Existing accounts and data were preserved.",
    );
  console.log("Confirmed deployment transaction:", result.transaction.hash);
  return result;
}
const call = (
  signer,
  receiver,
  method,
  args = {},
  deposit = 0n,
  gas = 100_000_000_000_000n,
) => send(signer, receiver, [actions.functionCall(method, args, gas, deposit)]);
for (const build of built.builds) {
  const bytes = await readFile(`public/wasm/${build.hash}.wasm`);
  if (
    digest(bytes) !== build.hash ||
    digest(await readFile(`public/manifests/${build.manifest_hash}.json`)) !==
      build.manifest_hash
  )
    throw new Error(
      "A published binary or build manifest does not match its fingerprint.",
    );
  const response = await fetch(wasmUrl(build), {
    signal: AbortSignal.timeout(20000),
  });
  if (
    !response.ok ||
    digest(Buffer.from(await response.arrayBuffer())) !== build.hash
  )
    throw new Error(
      "Publish the matching worker binaries on the website before deploying their registry.",
    );
}
const source = (build) => ({
  WasmUrl: {
    url: wasmUrl(build),
    hash: build.hash,
    build_target: "wasm32-wasip2",
  },
});
let project = await view(outlayer, "get_project", {
  project_id: built.project_id,
});
if (!project) {
  await call(
    root,
    outlayer,
    "create_project",
    { name: "sealwork", source: source(built.builds[0]) },
    100_000_000_000_000_000_000_000n,
  );
  project = await view(outlayer, "get_project", {
    project_id: built.project_id,
  });
}
if (project.owner !== accounts.root.account_id)
  throw new Error("The OutLayer project belongs to a different account.");
for (const build of built.builds) {
  let version = await view(outlayer, "get_version", {
    project_id: built.project_id,
    version_key: build.hash,
  });
  if (!version)
    await call(
      root,
      outlayer,
      "add_version",
      { project_name: "sealwork", source: source(build), set_active: false },
      100_000_000_000_000_000_000_000n,
    );
  version = await view(outlayer, "get_version", {
    project_id: built.project_id,
    version_key: build.hash,
  });
  if (version?.wasm_hash !== build.hash)
    throw new Error(
      "The published OutLayer version does not match the exact compiled build.",
    );
}
const state = await rpc.query({
  request_type: "view_account",
  account_id: built.contract_id,
  finality: "final",
});
if (state.code_hash === "11111111111111111111111111111111") {
  await send(market, built.contract_id, [
    actions.deployContract(binary),
    actions.functionCall(
      "init",
      {
        owner_id: accounts.root.account_id,
        outlayer_contract_id: outlayer,
        project_id: built.project_id,
        verifier_hash: verifier.hash,
        verifier_manifest_hash: verifier.manifest_hash,
        demo_buyer_id: accounts.buyer.account_id,
        demo_daily_limit: plan.daily_sponsored_limit,
      },
      60_000_000_000_000n,
      0n,
    ),
  ]);
} else {
  const code = await rpc.query({
    request_type: "view_code",
    account_id: built.contract_id,
    finality: "final",
  });
  if (digest(Buffer.from(code.code_base64, "base64")) !== digest(binary))
    throw new Error(
      "The account already contains different contract code. This recipe does not overwrite an existing deployment.",
    );
}
const config = await view(built.contract_id, "get_config");
if (
  config.owner_id !== accounts.root.account_id ||
  config.verifier_hash !== verifier.hash ||
  config.verifier_manifest_hash !== verifier.manifest_hash ||
  config.project_id !== built.project_id ||
  config.demo_buyer_id !== accounts.buyer.account_id
)
  throw new Error(
    "The deployed contract does not match this website and verifier.",
  );
for (const build of built.builds.filter(
  (build) => build.feature !== "verifier",
)) {
  const current = await view(built.contract_id, "get_build", {
    hash: build.hash,
  });
  if (!current)
    await call(
      root,
      built.contract_id,
      "register_build",
      {
        hash: build.hash,
        manifest_hash: build.manifest_hash,
        agent_id: build.agent_id,
        name: build.name,
        version: build.version,
        provider_id: build.provider_id,
        wasm_url: wasmUrl(build),
        description: build.description,
      },
      BigInt(config.build_storage_deposit),
    );
}
const deployment = {
  network: "testnet",
  contract_id: built.contract_id,
  outlayer_contract_id: outlayer,
  project_id: built.project_id,
  buyer_id: accounts.buyer.account_id,
  rpc_url: rpcUrl,
  keystore_url: "https://testnet-api.outlayer.ai/secrets/pubkey",
  outlayer_api_url: "https://testnet-api.outlayer.ai",
  verifier_hash: verifier.hash,
  verifier_manifest_hash: verifier.manifest_hash,
  verifier_url: wasmUrl(verifier),
  builds: built.builds
    .filter((build) => build.feature !== "verifier")
    .map((build) => ({
      hash: build.hash,
      manifest_hash: build.manifest_hash,
      agent_id: build.agent_id,
      name: build.name,
      version: build.version,
      provider_id: build.provider_id,
      wasm_url: wasmUrl(build),
      description: build.description,
    })),
  deployed_at: new Date().toISOString(),
  bank_supported: true,
  site_url: new URL(site).origin,
  contract_sha256: digest(binary),
};
await writeFile(
  "deployments/testnet.json",
  JSON.stringify(deployment, null, 2) + "\n",
);
console.log("Verified NEAR testnet deployment:", deployment.contract_id);
