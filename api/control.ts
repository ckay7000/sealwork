import { route, body, method } from "../server/http.js";
import { deployment, jobById, signedCall } from "../server/ledger.js";
import {
  HttpError,
  limitRequests,
  validJobId,
  verifyCapability,
} from "../server/security.js";

export default route(async (req, res) => {
  method(req, "POST");
  const input = body(req);
  const job_id = validJobId(input.job_id);
  const job = await jobById(job_id);
  if (job.contract_id !== deployment.contract_id)
    throw new HttpError(403, "This archived receipt remains available onchain. The current sponsor controls the active deployment.");
  if (job.buyer_id !== deployment.buyer_id)
    throw new HttpError(
      403,
      "The sponsored signer only controls its own testnet jobs.",
    );
  let name: string;
  if (input.action === "execute") {
    verifyCapability(job_id, input.capability);
    if (job.state !== "funded")
      throw new HttpError(
        409,
        "This job has already started. Refresh its receipt.",
      );
    if (Date.now() >= Number(BigInt(job.deadline) / 1_000_000n))
      throw new HttpError(
        409,
        "This job’s deadline has passed. Request its refund.",
      );
    name = "execute_job";
  } else if (input.action === "expire") {
    if (job.state === "settled") return res.status(200).json({ job });
    if (Date.now() < Number(BigInt(job.deadline) / 1_000_000n))
      throw new HttpError(409, "The deadline has not passed yet.");
    name = "expire_job";
  } else if (input.action === "claim") {
    if (job.settlement !== "claimable")
      throw new HttpError(409, "This job has no failed payment to retry.");
    name = "claim_settlement";
  } else if (input.action === "claim_compute") {
    if (job.compute_refund_state !== "claimable")
      throw new HttpError(
        409,
        "This job has no failed compute refund to retry.",
      );
    name = "claim_compute_refund";
  } else throw new HttpError(400, "Choose execute, expire, or claim.");
  limitRequests(
    String(
      req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local",
    )
      .split(",")[0]
      .trim() + ":control",
  );
  const result = await signedCall(deployment.contract_id, name, { job_id });
  return res
    .status(200)
    .json({ job: await jobById(job_id), transaction_hash: result.hash });
});
