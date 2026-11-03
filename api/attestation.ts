import { route, method } from "../server/http.js";
import { deploymentForJob, jobById } from "../server/ledger.js";
import { HttpError, validJobId } from "../server/security.js";
import { requestIdFromTransaction, summarizeAttestation } from "../server/evidence.js";

export default route(async (req, res) => {
  method(req, "GET");
  const id = validJobId(req.query.job_id);
  if (req.query.phase !== "agent" && req.query.phase !== "verifier")
    throw new HttpError(400, "Choose the agent or verifier execution.");
  const job = await jobById(id);
  const deployment = deploymentForJob(job);
  let request =
    req.query.phase === "agent"
      ? job.agent_request_id
      : job.verifier_request_id;
  const expected =
    req.query.phase === "agent" ? job.build_hash : job.verifier_hash;
  const dashboard = "https://app.outlayer.ai/executions?network=testnet";
  const transaction = req.query.phase === "agent" ? job.agent_transaction_hash : job.verifier_transaction_hash;
  if (!request && transaction) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(transaction))
      throw new HttpError(502, "This receipt has an invalid transaction reference.");
    const response = await fetch(deployment.rpc_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "sealwork-execution-proof", method: "tx", params: { tx_hash: transaction, sender_account_id: job.buyer_id, wait_until: "FINAL" } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new HttpError(503, "The NEAR execution record is temporarily unavailable.");
    const record = await response.json() as { result?: unknown };
    request = requestIdFromTransaction(record.result, {
      transaction_hash: transaction, outlayer_contract_id: deployment.outlayer_contract_id,
      contract_id: deployment.contract_id, buyer_id: job.buyer_id, project_id: deployment.project_id,
      job_id: job.id, input_commitment: job.input_commitment, wasm_hash: expected,
    }) || null;
  }
  if (!request)
    return res
      .status(200)
      .json({
        request_id: "",
        available: false,
        wasm_matches: false,
        url: dashboard,
      });
  if (!/^[0-9]{1,20}$/.test(request))
    throw new HttpError(
      502,
      "This receipt has an invalid execution reference.",
    );
  const url = `${deployment.outlayer_api_url}/attestations/by-request/${request}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json" },
  });
  if (response.status === 404)
    return res
      .status(200)
      .json({
        request_id: request,
        available: false,
        wasm_matches: false,
        url: dashboard,
      });
  if (!response.ok)
    throw new HttpError(
      503,
      "The execution evidence service is temporarily unavailable.",
    );
  const evidence = await response.json();
  return res
    .status(200)
    .json(summarizeAttestation(evidence, request, expected, url));
});
