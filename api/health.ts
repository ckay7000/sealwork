import { route, method } from "../server/http.js";
import { configured, deployment } from "../server/ledger.js";
export default route(async (req, res) => {
  method(req, "GET");
  return res.status(200).json({
    service: "Sealwork",
    network: "NEAR testnet",
    contract_id: deployment.contract_id,
    sponsored_jobs_configured: configured(),
    verifier_hash: deployment.verifier_hash || null,
  });
});
