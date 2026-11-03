import { describe, expect, it } from "vitest";
import { requestIdFromTransaction, summarizeAttestation, type ExecutionBinding } from "../../server/evidence";
const hash = "a".repeat(64);
const url = "https://testnet-api.outlayer.ai/attestations/by-request/42";
const binding: ExecutionBinding = {
  transaction_hash: "HKPL27raNxkJwYNZs6uX8xcPEai5S7aqTfD47wG9xQfF",
  outlayer_contract_id: "outlayer.testnet", contract_id: "market.sealwork-live.testnet",
  buyer_id: "buyer.sealwork-live.testnet", project_id: "sealwork-live.testnet/sealwork",
  job_id: "sw_11111111111111111111111111111111", input_commitment: "b".repeat(64), wasm_hash: hash,
};
function transactionRecord(overrides: Record<string, unknown> = {}, executor = binding.outlayer_contract_id) {
  const request = {
    request_id: 42, sender_id: binding.buyer_id, predecessor_id: binding.contract_id,
    project_id: binding.project_id, code_source: { WasmUrl: { hash } },
    input_data: JSON.stringify({ job_id: binding.job_id, input_commitment: binding.input_commitment }),
    ...overrides,
  };
  return {
    transaction: { hash: binding.transaction_hash, signer_id: binding.buyer_id, receiver_id: binding.contract_id },
    receipts_outcome: [{ outcome: { executor_id: executor, logs: ["EVENT_JSON:" + JSON.stringify({
      standard: "near-outlayer", event: "execution_requested", data: [{ request_data: JSON.stringify(request) }],
    })] } }],
  };
}
describe("public execution evidence", () => {
  it("recovers the real request ID from an OutLayer receipt bound to the transaction, caller, job, and binary", () => {
    const record = transactionRecord();
    record.receipts_outcome.push(...transactionRecord({ request_id: 43, code_source: { WasmUrl: { hash: "c".repeat(64) } } }).receipts_outcome);
    expect(requestIdFromTransaction(record, binding)).toBe("42");
    expect(requestIdFromTransaction(record, { ...binding, wasm_hash: "c".repeat(64) })).toBe("43");
  });
  it("rejects spoofed, unrelated, malformed, and ambiguous request events", () => {
    for (const overrides of [
      { sender_id: "outsider.testnet" }, { predecessor_id: "other.testnet" },
      { project_id: "other.testnet/sealwork" }, { code_source: { WasmUrl: { hash: "c".repeat(64) } } },
      { input_data: JSON.stringify({ job_id: "another-job", input_commitment: binding.input_commitment }) },
      { input_data: JSON.stringify({ job_id: binding.job_id, input_commitment: "d".repeat(64) }) },
      { input_data: "malformed" }, { request_id: "invalid" }, { request_id: Number.MAX_SAFE_INTEGER + 1 },
    ]) expect(requestIdFromTransaction(transactionRecord(overrides), binding)).toBeUndefined();
    expect(requestIdFromTransaction(transactionRecord({}, "outsider.testnet"), binding)).toBeUndefined();
    expect(requestIdFromTransaction(transactionRecord(), { ...binding, transaction_hash: "different" })).toBeUndefined();
    const ambiguous = transactionRecord();
    ambiguous.receipts_outcome.push(...transactionRecord({ request_id: 43 }).receipts_outcome);
    expect(requestIdFromTransaction(ambiguous, binding)).toBeUndefined();
    expect(requestIdFromTransaction(null, binding)).toBeUndefined();
  });
  it("links an observed binary hash to the requested receipt without claiming quote verification", () => {
    const value = summarizeAttestation(
      {
        task_id: 100,
        request_id: 42,
        wasm_hash: hash,
        tdx_quote: "a".repeat(200),
      },
      "42",
      hash,
      url,
    );
    expect(value.available).toBe(true);
    expect(value.wasm_matches).toBe(true);
    expect(value.quote_present).toBe(true);
    expect(value.url).toContain("/attestation/100?network=testnet");
    expect(value.measurements_approved).toBeUndefined();
  });
  it("does not accept a different request or binary as matching evidence", () => {
    expect(
      summarizeAttestation({ request_id: 43, wasm_hash: hash }, "42", hash, url)
        .available,
    ).toBe(false);
    expect(
      summarizeAttestation({ wasm_hash: "b".repeat(64) }, "42", hash, url)
        .wasm_matches,
    ).toBe(false);
  });
  it("does not turn absent or malformed records into proof", () => {
    expect(summarizeAttestation(null, "42", hash, url).available).toBe(false);
    expect(
      summarizeAttestation(
        { wasm_hash: "not-a-hash", tdx_quote: "" },
        "42",
        hash,
        url,
      ).quote_present,
    ).toBe(false);
  });
});
