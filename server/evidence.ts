import type { AttestationSummary } from "../shared/types";

const validHash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export interface ExecutionBinding {
  transaction_hash: string;
  outlayer_contract_id: string;
  contract_id: string;
  buyer_id: string;
  project_id: string;
  job_id: string;
  input_commitment: string;
  wasm_hash: string;
}
const object = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

export function requestIdFromTransaction(value: unknown, expected: ExecutionBinding): string | undefined {
  const result = object(value);
  const transaction = object(result.transaction);
  if (transaction.hash !== expected.transaction_hash || transaction.signer_id !== expected.buyer_id || transaction.receiver_id !== expected.contract_id)
    return undefined;
  const requests = new Set<string>();
  for (const receipt of Array.isArray(result.receipts_outcome) ? result.receipts_outcome : []) {
    const outcome = object(object(receipt).outcome);
    if (outcome.executor_id !== expected.outlayer_contract_id) continue;
    for (const log of Array.isArray(outcome.logs) ? outcome.logs : []) {
      if (typeof log !== "string" || !log.startsWith("EVENT_JSON:")) continue;
      try {
        const event = object(JSON.parse(log.slice("EVENT_JSON:".length)));
        if (event.standard !== "near-outlayer" || event.event !== "execution_requested" || !Array.isArray(event.data)) continue;
        for (const data of event.data) {
          const request = object(JSON.parse(object(data).request_data));
          const input = object(JSON.parse(request.input_data));
          const source = object(object(request.code_source).WasmUrl);
          if (request.sender_id !== expected.buyer_id || request.predecessor_id !== expected.contract_id || request.project_id !== expected.project_id || source.hash !== expected.wasm_hash || input.job_id !== expected.job_id || input.input_commitment !== expected.input_commitment) continue;
          if (typeof request.request_id === "number" && !Number.isSafeInteger(request.request_id)) continue;
          const id = String(request.request_id);
          if (/^[0-9]{1,20}$/.test(id)) requests.add(id);
        }
      } catch {
        // Unrelated or malformed logs cannot become an execution reference.
      }
    }
  }
  return requests.size === 1 ? [...requests][0] : undefined;
}
export function summarizeAttestation(
  value: unknown,
  requestId: string,
  expectedHash: string,
  recordUrl: string,
): AttestationSummary {
  const outer =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const record =
    outer.attestation && typeof outer.attestation === "object"
      ? (outer.attestation as Record<string, unknown>)
      : outer;
  const taskId = String(record.task_id || "");
  const linkedRequest = record.request_id;
  const requestMatches =
    linkedRequest === undefined || String(linkedRequest) === requestId;
  const wasmHash = validHash(record.wasm_hash) ? record.wasm_hash : undefined;
  const quote = record.tdx_quote ?? record.quote;
  return {
    request_id: requestId,
    available: Boolean(wasmHash && requestMatches),
    wasm_hash: wasmHash,
    wasm_matches: Boolean(wasmHash === expectedHash && requestMatches),
    input_hash: validHash(record.input_hash) ? record.input_hash : undefined,
    output_hash: validHash(record.output_hash) ? record.output_hash : undefined,
    quote_present:
      typeof quote === "string"
        ? quote.length > 100
        : Array.isArray(quote) && quote.length > 100,
    url: /^[0-9]+$/.test(taskId)
      ? `https://app.outlayer.ai/attestation/${taskId}?network=testnet`
      : recordUrl,
  };
}
