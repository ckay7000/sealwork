import { route, body } from "../server/http.js";
import { createSponsoredJob, jobById, view } from "../server/ledger.js";
import {
  HttpError,
  issueCapability,
  limitRequests,
  requireString,
  validJobId,
  verifyChallenge,
} from "../server/security.js";
import type { AgentBuild, Job } from "../shared/types";
import { eligibleBuilds, verifyPermit } from "../server/planner.js";

export default route(async (req, res) => {
  if (req.method === "GET") {
    if (req.query.id !== undefined)
      return res
        .status(200)
        .json({ job: await jobById(validJobId(req.query.id)) });
    return res
      .status(200)
      .json({ jobs: await view<Job[]>("list_jobs", { limit: 30 }) });
  }
  if (req.method !== "POST")
    throw new HttpError(405, "Use GET or POST for jobs.");
  const input = body(req);
  verifyChallenge(input.challenge);
  limitRequests(
    String(
      req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local",
    )
      .split(",")[0]
      .trim(),
  );
  const job_id = validJobId(input.job_id);
  const build_hash = requireString(
    input.build_hash,
    /^[a-f0-9]{64}$/,
    "Choose a published agent build.",
  );
  const input_commitment = requireString(
    input.input_commitment,
    /^[a-f0-9]{64}$/,
    "The private input commitment is invalid.",
  );
  const encrypted_input = requireString(
    input.encrypted_input,
    /^[A-Za-z0-9+/]+={0,2}$/,
    "Send the encrypted input packet, never plaintext files.",
  );
  if (
    encrypted_input.length < 100 ||
    encrypted_input.length > 30000 ||
    Buffer.from(encrypted_input, "base64")[0] !== 1
  )
    throw new HttpError(
      400,
      "The encrypted input packet has an invalid format or size.",
    );
  const title = requireString(
    input.title,
    /^[^\x00-\x1f]{3,120}$/,
    "Use a short public job name.",
  );
  const deadline_seconds = input.scenario === "timeout" ? 10 : 180;
  if (input.hiring_permit !== undefined) {
    verifyPermit(input.hiring_permit, job_id, build_hash);
    if (input.scenario !== "normal") throw new HttpError(400, "AI hiring requires the agreed execution deadline.");
    const current = eligibleBuilds(await view<AgentBuild[]>("list_builds"), "balanced");
    if (!current.some(build => build.hash === build_hash))
      throw new HttpError(409, "The recommended build no longer meets the hiring policy. Request a fresh plan. No job was funded.");
  }
  const result = await createSponsoredJob({
    job_id,
    title,
    build_hash,
    input_commitment,
    encrypted_input,
    deadline_seconds,
  });
  return res
    .status(201)
    .json({ ...result, capability: issueCapability(job_id) });
});
