import { route, body, method } from "../server/http.js";
import { view } from "../server/ledger.js";
import { planHire } from "../server/planner.js";
import { HttpError, limitRequests, validJobId, verifyChallenge } from "../server/security.js";
import type { AgentBuild } from "../shared/types";

export default route(async (req, res) => {
  method(req, "POST");
  const input = body(req);
  if (Object.keys(input).some(k => !["job_id", "priority", "challenge"].includes(k)))
    throw new HttpError(400, "The hiring agent accepts constraints only. Keep financial files in the encrypted job flow.");
  verifyChallenge(input.challenge);
  const jobId = validJobId(input.job_id);
  if (input.priority !== "proven" && input.priority !== "balanced") throw new HttpError(400, "Choose a supported hiring priority.");
  limitRequests(`${String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local").split(",")[0].trim()}:planner`);
  const builds = await view<AgentBuild[]>("list_builds");
  return res.status(200).json({ plan: await planHire(jobId, input.priority, builds) });
});
