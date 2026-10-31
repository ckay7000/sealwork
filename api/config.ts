import { route, method } from "../server/http.js";
import { createChallenge, snapshot } from "../server/ledger.js";
import { plannerConfig } from "../server/planner.js";
import { privateAiConfig } from "../server/private-ai.js";
export default route(async (req, res) => {
  method(req, "GET");
  const config = await snapshot();
  return res
    .status(200)
    .json({ ...config, create_challenge: createChallenge(), planner: plannerConfig(), private_ai: privateAiConfig() });
});
