import {
  Account,
  JsonRpcProvider,
  KeyPair,
  actions,
  parseNearAmount,
} from "near-api-js";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const accountId = process.env.SEALWORK_ROOT_ID || "sealwork-lab.testnet";
if (!/^[a-z0-9-]+\.testnet$/.test(accountId))
  throw new Error("Choose a dedicated NEAR testnet root account.");
const privateFile = path.resolve(process.env.SEALWORK_ACCOUNTS_FILE || ".local/testnet-accounts.json");
if (!privateFile.startsWith(path.resolve(".local") + path.sep))
  throw new Error("Testnet credentials must remain in the ignored .local directory.");
await mkdir(".local", { recursive: true, mode: 0o700 });
let saved;
try {
  saved = JSON.parse(await readFile(privateFile, "utf8"));
} catch {
  saved = null;
}
const rpc = new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" });
if (saved && saved.root?.account_id !== accountId)
  throw new Error("The saved identities belong to another deployment. Choose a separate private accounts file.");
if (!saved) {
  const key = KeyPair.fromRandom("ed25519");
  const response = await fetch("https://helper.testnet.near.org/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      newAccountId: accountId,
      newAccountPublicKey: key.getPublicKey().toString(),
    }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json();
  if (!response.ok || body.error)
    throw new Error(
      `The official testnet helper could not create the account (HTTP ${response.status}).`,
    );
  saved = { root: { account_id: accountId, secret_key: key.toString() } };
  await writeFile(privateFile, JSON.stringify(saved, null, 2), { mode: 0o600 });
  console.log("Created dedicated testnet account:", accountId);
}
const root = new Account(saved.root.account_id, rpc, saved.root.secret_key);
for (const [role, prefix, balance] of [
  ["contract", "market", "6"],
  ["buyer", "buyer", "3"],
  ["ledgerline", "ledgerline", "0.15"],
  ["archivist", "archivist", "0.15"],
]) {
  if (saved[role]) continue;
  const key = KeyPair.fromRandom("ed25519");
  const child = `${prefix}.${saved.root.account_id}`;
  const result = await root.signAndSendTransaction({
    receiverId: child,
    actions: [
      actions.createAccount(),
      actions.transfer(parseNearAmount(balance)),
      actions.addFullAccessKey(key.getPublicKey()),
    ],
    waitUntil: "FINAL",
  });
  if (typeof result.status === "object" && "Failure" in result.status)
    throw new Error(`The dedicated testnet role ${child} could not be created. Existing accounts are preserved.`);
  saved[role] = { account_id: child, secret_key: key.toString() };
  await writeFile(privateFile, JSON.stringify(saved, null, 2), { mode: 0o600 });
  console.log("Created isolated role:", child);
}
for (const [role, account] of Object.entries(saved)) {
  const state = await rpc.query({
    request_type: "view_account",
    account_id: account.account_id,
    finality: "final",
  });
  console.log(
    role,
    account.account_id,
    "balance:",
    Number(BigInt(state.amount) / 10n ** 20n) / 10000,
    "testnet NEAR",
  );
}
