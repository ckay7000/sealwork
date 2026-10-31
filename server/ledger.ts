import { Account, JsonRpcProvider, actions } from "near-api-js";
import type { KeyPairString } from "near-api-js";
import deploymentJson from "../deployments/testnet.json" with { type: "json" };
import firstDeploymentJson from "../deployments/testnet-first.json" with { type: "json" };
import previousDeploymentJson from "../deployments/testnet-v1.json" with { type: "json" };
import type {
  AgentBuild,
  Deployment,
  Job,
  PublicConfig,
} from "../shared/types";
import { COMPUTE_DEPOSIT, DEMO_BUDGET, STORAGE_PRICE } from "../shared/format.js";
import { HttpError, issueCapability, issueChallenge } from "./security.js";

export const deployment = deploymentJson as Deployment;
const firstDeployment = firstDeploymentJson as Deployment;
const previousDeployment = previousDeploymentJson as Deployment;
export function deploymentForJob(job: Job): Deployment {
  return job.contract_id === firstDeployment.contract_id ? firstDeployment : job.contract_id === previousDeployment.contract_id ? previousDeployment : deployment;
}
export const rpc = new JsonRpcProvider({
  url: process.env.SEALWORK_RPC_URL || deployment.rpc_url,
});
export const configured = (): boolean =>
  Boolean(
    deployment.verifier_hash &&
      process.env.SEALWORK_BUYER_KEY &&
      process.env.SEALWORK_CONTROL_SECRET &&
      process.env.SEALWORK_CONTROL_SECRET.length >= 32 &&
      process.env.SEALWORK_READ_ONLY !== "true",
  );

export async function view<T>(
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return viewAt<T>(deployment.contract_id, method, args);
}
async function viewAt<T>(
  contractId: string,
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const response = await rpc.query({
    request_type: "call_function",
    account_id: contractId,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    finality: "optimistic",
  });
  if (!("result" in response) || !Array.isArray(response.result))
    throw new HttpError(
      502,
      "The testnet RPC returned an unexpected view response.",
    );
  return JSON.parse(Buffer.from(response.result).toString("utf8")) as T;
}
interface ContractConfig {
  verifier_hash: string;
  project_id: string;
  outlayer_contract_id: string;
  demo_buyer_id: string;
  job_storage_deposit: string;
  demo_daily_limit: number;
  demo_jobs_today: number;
}
export async function contractConfig(): Promise<ContractConfig> {
  const config = await view<ContractConfig>("get_config");
  if (
    config.verifier_hash !== deployment.verifier_hash ||
    config.project_id !== deployment.project_id ||
    config.outlayer_contract_id !== deployment.outlayer_contract_id ||
    config.demo_buyer_id !== deployment.buyer_id
  )
    throw new HttpError(
      503,
      "This website and contract configuration do not agree. Sponsored jobs are paused.",
    );
  return config;
}
let publicKeyCache: { key: string; expires: number } | undefined;
export async function publicEncryptionKey(): Promise<string> {
  if (publicKeyCache && publicKeyCache.expires > Date.now())
    return publicKeyCache.key;
  const response = await fetch(deployment.keystore_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accessor: { type: "Project", project_id: deployment.project_id },
      owner: deployment.buyer_id,
      secrets_json: '{"SEALWORK_INPUT":""}',
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new HttpError(
      503,
      "The private execution keystore is temporarily unavailable.",
    );
  const result = (await response.json()) as { pubkey?: string; owner?: string };
  if (
    !result.pubkey ||
    !/^[a-f0-9]{64}$/.test(result.pubkey) ||
    result.owner !== deployment.buyer_id
  )
    throw new HttpError(
      503,
      "The keystore returned an unexpected encryption key.",
    );
  publicKeyCache = { key: result.pubkey, expires: Date.now() + 300000 };
  return result.pubkey;
}

let signingQueue: Promise<unknown> = Promise.resolve();
export async function signedCall(
  receiver: string,
  method: string,
  args: Record<string, unknown>,
  deposit = 0n,
  gas = 300_000_000_000_000n,
): Promise<{ hash: string; value: unknown }> {
  if (!configured())
    throw new HttpError(
      503,
      "Sponsored jobs are not configured on this deployment.",
    );
  const buyerId = process.env.SEALWORK_BUYER_ID || deployment.buyer_id;
  if (
    buyerId !== deployment.buyer_id ||
    !buyerId.endsWith(".testnet") ||
    !receiver.endsWith(".testnet")
  )
    throw new HttpError(
      503,
      "The signing account must match this isolated testnet deployment.",
    );
  // Serialize a warm instance's nonce use. near-api-js also refreshes and
  // retries invalid nonces when separate serverless instances race.
  const execute = async () => {
    const key = process.env.SEALWORK_BUYER_KEY!;
    if (!key.startsWith("ed25519:"))
      throw new HttpError(
        503,
        "The isolated signing account is not configured correctly.",
      );
    const buyer = new Account(buyerId, rpc, key as KeyPairString);
    const result = await buyer.signAndSendTransaction({
      receiverId: receiver,
      actions: [actions.functionCall(method, args, gas, deposit)],
      waitUntil: "FINAL",
    });
    const status = result.status;
    if (typeof status === "object" && "Failure" in status)
      throw new HttpError(
        409,
        "The testnet contract declined this action. Refresh the job to see its current state.",
      );
    let value: unknown = null;
    if (
      typeof status === "object" &&
      "SuccessValue" in status &&
      status.SuccessValue
    ) {
      try {
        value = JSON.parse(
          Buffer.from(status.SuccessValue, "base64").toString("utf8"),
        );
      } catch {
        /* void return */
      }
    }
    return { hash: result.transaction.hash, value };
  };
  const pending = signingQueue.then(execute, execute);
  signingQueue = pending.catch(() => undefined);
  return pending;
}

export async function snapshot(): Promise<PublicConfig> {
  const blank: PublicConfig = {
    ready: false,
    network: "testnet",
    contract_id: deployment.contract_id,
    buyer_id: deployment.buyer_id,
    project_id: deployment.project_id,
    encryption_public_key: "",
    outlayer_api_url: deployment.outlayer_api_url,
    budget: DEMO_BUDGET.toString(),
    storage_deposit: (16384n * STORAGE_PRICE).toString(),
    compute_deposit: COMPUTE_DEPOSIT.toString(),
    total_deposit: (
      DEMO_BUDGET +
      COMPUTE_DEPOSIT +
      16384n * STORAGE_PRICE
    ).toString(),
    verifier_hash: deployment.verifier_hash,
    builds: [],
    jobs: [],
    timestamp: new Date().toISOString(),
    demo_remaining: 0,
    bank_supported: Boolean((deploymentJson as unknown as {bank_supported?:boolean}).bank_supported),
  };
  if (!deployment.verifier_hash)
    return {
      ...blank,
      status_message:
        "The protocol deployment is being prepared. You can explore the workflow below.",
    };
  try {
    const results = await Promise.allSettled([
      contractConfig(),
      view<AgentBuild[]>("list_builds"),
      view<Job[]>("list_jobs", { limit: 30 }),
      publicEncryptionKey(),
    ]);
    const [config, builds, jobs, key] = results;
    if (builds.status === "fulfilled") blank.builds = builds.value;
    if (jobs.status === "fulfilled") blank.jobs = jobs.value.map(job => ({ ...job, contract_id: deployment.contract_id }));
    if (config.status !== "fulfilled") throw config.reason;
    if (key.status !== "fulfilled") throw key.reason;
    if (builds.status !== "fulfilled" || jobs.status !== "fulfilled")
      throw new Error("Snapshot is incomplete");
    blank.storage_deposit = config.value.job_storage_deposit;
    blank.total_deposit = (
      DEMO_BUDGET +
      COMPUTE_DEPOSIT +
      BigInt(blank.storage_deposit)
    ).toString();
    blank.encryption_public_key = key.value;
    blank.demo_remaining = Math.max(
      0,
      config.value.demo_daily_limit - config.value.demo_jobs_today,
    );
    blank.ready = configured() && blank.demo_remaining > 0;
    if (!configured())
      blank.status_message =
        "You are viewing live onchain history. Sponsored job creation is not enabled on this deployment.";
    else if (!blank.demo_remaining)
      blank.status_message =
        "Today’s sponsored job allowance is complete. Existing jobs and receipts remain available.";
    return blank;
  } catch {
    return {
      ...blank,
      status_message:
        "NEAR testnet or private execution is temporarily unavailable. Existing receipts will refresh when the connection returns.",
    };
  }
}

export async function jobById(id: string): Promise<Job> {
  // Keep the first deployment's permanent receipts readable after moving
  // the demo to a fresh verifier and escrow. Never write to the archive.
  for (const contractId of new Set([deployment.contract_id, previousDeployment.contract_id, firstDeployment.contract_id])) {
    const job = await viewAt<Job | null>(contractId, "get_job", { job_id: id });
    if (job) return { ...job, contract_id: contractId };
  }
  throw new HttpError(404, "This job does not exist on the deployed contracts.");
}
export async function createSponsoredJob(input: {
  job_id: string;
  title: string;
  build_hash: string;
  input_commitment: string;
  encrypted_input: string;
  deadline_seconds: number;
}): Promise<{ job: Job; transaction_hash: string }> {
  const config = await contractConfig();
  if (config.demo_jobs_today >= config.demo_daily_limit)
    throw new HttpError(
      429,
      "Today’s sponsored allowance is complete. Come back after the next UTC day begins.",
    );
  if (!deployment.builds.some((build) => build.hash === input.build_hash))
    throw new HttpError(400, "Choose one of the reviewed demo builds.");
  const secretDeposit =
    (BigInt(input.encrypted_input.length) + 2048n) * STORAGE_PRICE;
  const total =
    DEMO_BUDGET + COMPUTE_DEPOSIT + BigInt(config.job_storage_deposit);
  const state = (await rpc.query({
    request_type: "view_account",
    account_id: deployment.buyer_id,
    finality: "optimistic",
  })) as { amount: string };
  if (BigInt(state.amount) < total + secretDeposit + 5n * 10n ** 22n)
    throw new HttpError(
      503,
      "The sponsored testnet wallet needs a top-up. Browse existing receipts in the meantime.",
    );
  // Fund first. A failed/replayed create cannot spend a secret-storage
  // deposit, and the onchain daily limit caps sponsored storage expenses.
  const funded = await signedCall(
    deployment.contract_id,
    "create_job",
    {
      job_id: input.job_id,
      title: input.title,
      build_hash: input.build_hash,
      input_commitment: input.input_commitment,
      budget: DEMO_BUDGET.toString(),
      compute_deposit: COMPUTE_DEPOSIT.toString(),
      deadline_seconds: input.deadline_seconds,
    },
    total,
    70_000_000_000_000n,
  );
  const job = funded.value as Job;
  if (!job || job.id !== input.job_id)
    throw new HttpError(
      502,
      "The job was submitted. Refresh the workspace to recover its onchain state.",
    );
  try {
    await signedCall(
      deployment.outlayer_contract_id,
      "store_secrets",
      {
        accessor: { Project: { project_id: deployment.project_id } },
        profile: job.profile,
        encrypted_secrets_base64: input.encrypted_input,
        vault_id: null,
        access: {
          Logic: {
            operator: "And",
            conditions: [
              {
                Predecessor: {
                  condition: {
                    Whitelist: { accounts: [deployment.contract_id] },
                  },
                },
              },
              {
                Logic: {
                  operator: "Or",
                  conditions: [
                    { WasmHash: { hash: job.build_hash } },
                    { WasmHash: { hash: job.verifier_hash } },
                  ],
                },
              },
              {
                ValidUntil: {
                  until_ns: (BigInt(job.deadline) + 60_000_000_000n).toString(),
                },
              },
            ],
          },
        },
      },
      secretDeposit,
      100_000_000_000_000n,
    );
  } catch {
    throw new HttpError(
      502,
      "The job is funded, but private input storage could not complete. Its budget can be refunded after the deadline.",
      { job_id: job.id, capability: issueCapability(job.id) },
    );
  }
  return { job, transaction_hash: funded.hash };
}

export function createChallenge(): string | undefined {
  return configured() ? issueChallenge() : undefined;
}
