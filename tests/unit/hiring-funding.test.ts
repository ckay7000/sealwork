import { afterEach, beforeEach, expect, it, vi } from "vitest";
import built from "../../deployments/builds.json" with { type: "json" };
import { issueChallenge } from "../../server/security";
import { signPermit } from "../../server/planner";

const ledger = vi.hoisted(() => ({ createSponsoredJob: vi.fn(), view: vi.fn(), jobById: vi.fn() }));
vi.mock("../../server/ledger.js", () => ledger);
import jobs from "../../api/jobs";

beforeEach(() => {
  vi.stubEnv("SEALWORK_CONTROL_SECRET", "synthetic-funding-secret-with-at-least-32-characters");
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("stops funding if a recommended build fails another job before the permit is used", async () => {
  const build = built.builds.find(value => value.feature === "ledgerline-v1")!;
  const id = "sw_" + "c".repeat(32);
  const permit = signPermit(id, build.hash, Date.now() + 60_000);
  ledger.view.mockResolvedValue([{ ...build, accepted: 3, rejected: 1, execution_errors: 0 }]);
  const response = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  const request = {
    method: "POST", headers: {}, socket: { remoteAddress: "synthetic-funding-test" },
    body: { job_id: id, build_hash: build.hash, input_commitment: "d".repeat(64),
      encrypted_input: Buffer.alloc(120, 1).toString("base64"), title: "Public test job",
      scenario: "normal", challenge: issueChallenge(), hiring_permit: permit },
  };
  await jobs(request as Parameters<typeof jobs>[0], response as unknown as Parameters<typeof jobs>[1]);
  expect(response.status).toHaveBeenCalledWith(409);
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("no longer meets") }));
  expect(ledger.createSponsoredJob).not.toHaveBeenCalled();
});
