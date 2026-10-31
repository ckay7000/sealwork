import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const accountsFile =
  process.env.SEALWORK_ACCOUNTS_FILE || ".local/testnet-accounts.json";
const accounts = JSON.parse(await readFile(accountsFile, "utf8"));
if (!accounts.buyer?.account_id?.endsWith(".testnet"))
  throw new Error("Create the dedicated testnet accounts first.");
await writeFile(
  ".env.local",
  [
    `SEALWORK_BUYER_ID=${accounts.buyer.account_id}`,
    `SEALWORK_BUYER_KEY=${accounts.buyer.secret_key}`,
    `SEALWORK_CONTROL_SECRET=${randomBytes(32).toString("hex")}`,
    "SEALWORK_RPC_URL=https://test.rpc.fastnear.com",
  ].join("\n") + "\n",
  { mode: 0o600 },
);
console.log(
  "Wrote private local configuration for",
  accounts.buyer.account_id,
  "(no keys displayed).",
);
