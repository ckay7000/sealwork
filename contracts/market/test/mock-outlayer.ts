import { NearBindgen, call, near, assert } from "near-sdk-js";
const CHECKS = [
  "row_count",
  "unique_ids",
  "amounts_preserved",
  "vendor_integrity",
  "ledger_matches",
  "delivery_integrity",
];
@NearBindgen({})
export class MockOutLayer {
  mode = "accepted";
  sequence = 0;
  @call({})
  set_mode({ mode }: { mode: string }) {
    this.mode = mode;
  }
  @call({ payableFunction: true })
  request_execution({
    source,
    input_data,
  }: {
    source: { Project: { version_key: string } };
    input_data: string;
  }): unknown {
    const input = JSON.parse(input_data);
    const verifier = typeof input.sealed_result === "string";
    assert(
      !(
        this.mode === "agent_admission_failed" ||
        (this.mode === "verifier_admission_failed" && verifier)
      ),
      "Fixture rejects admission",
    );
    if (this.mode === "null_output") return null;
    const reference = {
      request_id: this.mode === "transaction_context" || this.mode === "missing_context"
        ? null : this.mode === "invalid_request_id" ? "not-a-request" : String(++this.sequence),
      transaction_hash: this.mode === "transaction_context"
        ? "HKPL27raNxkJwYNZs6uX8xcPEai5S7aqTfD47wG9xQfF"
        : this.mode === "invalid_transaction_hash" ? "not-a-transaction" : null,
    };
    if (!verifier)
      return {
        schema: "sealwork.agent-output.v1",
        job_id: input.job_id,
        input_commitment:
          this.mode === "wrong_input" ? "f".repeat(64) : input.input_commitment,
        manifest_hash:
          this.mode === "wrong_manifest"
            ? "f".repeat(64)
            : input.agent_manifest_hash,
        result_commitment: "d".repeat(64),
        sealed_result: this.mode === "large_delivery" ? "A".repeat(32000) : "fixture_ciphertext",
        ...reference,
      };
    const accepted = this.mode !== "rejected";
    const checks = CHECKS.map((id) => ({
      id,
      passed: accepted || id !== "amounts_preserved",
    }));
    if (this.mode === "duplicate_checks") checks[5] = { ...checks[0] };
    if (this.mode === "lying_verdict") checks[2].passed = false;
    return {
      schema: "sealwork.verification.v1",
      job_id: input.job_id,
      input_commitment: input.input_commitment,
      agent_manifest_hash: input.agent_manifest_hash,
      verifier_manifest_hash: "e".repeat(64),
      result_commitment: input.result_commitment,
      result_ciphertext:
        this.mode === "large_delivery"
          ? "AQAA" + "A".repeat(11996)
          : "AQAAfixture_ciphertext",
      accepted,
      checks,
      ...reference,
    };
  }
}
