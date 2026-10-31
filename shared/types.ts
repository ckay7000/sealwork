export type JobOutcome =
  | "accepted"
  | "rejected"
  | "timed_out"
  | "execution_error";
export type JobState =
  | "funded"
  | "agent_running"
  | "verifier_running"
  | "settled";
export type SettlementState = "pending" | "paid" | "refunded" | "claimable";

export interface CheckResult {
  id: string;
  passed: boolean;
}

export interface AgentBuild {
  hash: string;
  manifest_hash: string;
  agent_id: string;
  name: string;
  version: string;
  provider_id: string;
  wasm_url: string;
  description: string;
  created_at: string;
  accepted: number;
  rejected: number;
  timed_out: number;
  execution_errors: number;
  earned: string;
}

export interface Job {
  contract_id?: string;
  id: string;
  title: string;
  buyer_id: string;
  provider_id: string;
  build_hash: string;
  manifest_hash: string;
  verifier_hash: string;
  input_commitment: string;
  profile: string;
  budget: string;
  compute_remaining: string;
  compute_refund_amount: string;
  compute_refund_state: "none" | "pending" | "paid" | "claimable";
  storage_deposit: string;
  state: JobState;
  outcome: JobOutcome | null;
  settlement: SettlementState;
  settlement_amount: string;
  settlement_recipient: string;
  created_at: string;
  deadline: string;
  settled_at: string | null;
  agent_request_id: string | null;
  verifier_request_id: string | null;
  agent_transaction_hash: string | null;
  verifier_transaction_hash: string | null;
  result_commitment: string | null;
  result_ciphertext: string | null;
  checks: CheckResult[];
  reason: string | null;
}

export interface PrivateInput {
  job_id: string;
  source_csv: string;
  ledger_csv: string;
  buyer_key: string;
  salt: string;
}

export interface PrivatePacket {
  input: PrivateInput;
  input_commitment: string;
}

export interface ResultRow {
  invoice_id: string;
  vendor: string;
  amount_minor: number;
  currency: string;
  status: "matched" | "unpaid" | "mismatch";
}

export interface PrivateResult {
  schema: "sealwork.invoice-reconciliation.v1";
  rows: ResultRow[];
}

export interface Deployment {
  network: "testnet";
  contract_id: string;
  outlayer_contract_id: string;
  project_id: string;
  buyer_id: string;
  rpc_url: string;
  keystore_url: string;
  outlayer_api_url: string;
  verifier_hash: string;
  verifier_manifest_hash: string;
  verifier_url: string;
  builds: Array<
    Pick<
      AgentBuild,
      | "hash"
      | "manifest_hash"
      | "agent_id"
      | "name"
      | "version"
      | "provider_id"
      | "wasm_url"
      | "description"
    >
  >;
  deployed_at: string;
}

export interface PublicConfig {
  ready: boolean;
  network: "testnet";
  contract_id: string;
  buyer_id: string;
  project_id: string;
  encryption_public_key: string;
  outlayer_api_url: string;
  budget: string;
  storage_deposit: string;
  compute_deposit: string;
  total_deposit: string;
  verifier_hash: string;
  builds: AgentBuild[];
  jobs: Job[];
  timestamp: string;
  demo_remaining: number;
  create_challenge?: string;
  status_message?: string;
  planner?: { ready: boolean; model: string; prompt_hash: string; policy_hash: string };
}

export interface HiringPlan {
  job_id: string;
  build_hash: string;
  rationale: string;
  priority: "proven" | "balanced";
  budget: string;
  expires_at: number;
  model: string;
  model_response_id: string;
  prompt_hash: string;
  policy_hash: string;
  response_hash: string;
  permit: string;
}

export interface AttestationSummary {
  request_id: string;
  available: boolean;
  wasm_hash?: string;
  input_hash?: string;
  output_hash?: string;
  measurements_approved?: boolean;
  quote_present?: boolean;
  wasm_matches?: boolean;
  input_matches?: boolean;
  output_matches?: boolean;
  task_hash_matches?: boolean;
  independently_verified?: boolean;
  url: string;
}

export const CHECKS = [
  {
    id: "row_count",
    label: "Every invoice is included",
    detail: "The result contains exactly one row for each source invoice.",
  },
  {
    id: "unique_ids",
    label: "No duplicates or invented invoices",
    detail: "Invoice identifiers are unique and match the source.",
  },
  {
    id: "amounts_preserved",
    label: "Amounts and currencies are preserved",
    detail:
      "Every amount is checked in integer minor units against its source.",
  },
  {
    id: "vendor_integrity",
    label: "Vendor details are preserved",
    detail: "Vendor names follow the agreed whitespace normalization.",
  },
  {
    id: "ledger_matches",
    label: "Payment statuses match the ledger",
    detail:
      "Matched, unpaid, and mismatch statuses are independently recomputed.",
  },
  {
    id: "delivery_integrity",
    label: "The encrypted delivery matches the checked result",
    detail:
      "The verifier decrypts the buyer delivery and checks the same bytes.",
  },
] as const;

export const SOURCE_SAMPLE = `invoice_id,vendor,amount,currency
INV-1041,Northstar Design,1250.00,USD
INV-1042,Cloud Harbor,89.50,USD
INV-1043,Studio Moss,640.00,USD
INV-1044,Atlas Research,320.75,USD
INV-1045,Paper Plane,175.00,USD
INV-1046,Fern & Co,48.25,USD`;

export const LEDGER_SAMPLE = `invoice_id,amount,currency
INV-1041,1250.00,USD
INV-1042,89.50,USD
INV-1043,640.00,USD
INV-1044,300.75,USD
INV-1046,48.25,USD`;
