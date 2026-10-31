import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import built from "../../deployments/builds.json" with { type: "json" };
import type { AgentBuild } from "../../shared/types";
import { eligibleBuilds, planHire, signPermit, validateRecommendation, verifyPermit } from "../../server/planner";

const records: AgentBuild[] = built.builds.filter(b => b.feature !== "verifier").map(b => ({
  ...b, wasm_url: "https://sealwork.vercel.app/wasm/" + b.hash + ".wasm", created_at: "0",
  accepted: b.feature === "ledgerline-v1" ? 3 : 0, rejected: b.feature === "ledgerline-v2" ? 1 : 0,
  execution_errors: 0, timed_out: 0, earned: "0",
}));
const id = "sw_" + "a".repeat(32);
describe("AI hiring keeps financial data and payment authority outside the model", () => {
  beforeEach(() => { vi.stubEnv("SEALWORK_CONTROL_SECRET", "synthetic-hiring-secret-with-more-than-32-characters"); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  it("requires actual acceptance evidence when requested and blocks faulty versions", () => {
    expect(eligibleBuilds(records, "proven").map(b => b.hash)).toEqual([records[0].hash]);
    expect(eligibleBuilds(records, "balanced")).toHaveLength(2);
    expect(eligibleBuilds(records.map(b => ({ ...b, rejected: 1 })), "balanced")).toEqual([]);
  });
  it("rejects attempts to change recipients, budgets, checks, or the chosen build", () => {
    const eligible = eligibleBuilds(records, "proven");
    const good = { build_hash: eligible[0].hash, rationale: "This version has accepted deliveries and no recorded rejected results." };
    expect(validateRecommendation(good, eligible)).toEqual(good);
    for (const bad of [ { ...good, recipient: "attacker.testnet" }, { ...good, budget: "100" },
      { ...good, checks: [] }, { ...good, build_hash: records[1].hash }, null ])
      expect(() => validateRecommendation(bad, eligible)).toThrow();
  });
  it("binds a short-lived funding permit to one job and exact build", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-31T00:00:00Z"));
    const permit = signPermit(id, records[0].hash, Date.now() + 60_000);
    expect(() => verifyPermit(permit, id, records[0].hash)).not.toThrow();
    expect(() => verifyPermit(permit, "sw_" + "b".repeat(32), records[0].hash)).toThrow();
    expect(() => verifyPermit(permit, id, records[1].hash)).toThrow();
    expect(() => verifyPermit(permit + "x", id, records[0].hash)).toThrow();
    vi.advanceTimersByTime(60_001);
    expect(() => verifyPermit(permit, id, records[0].hash)).toThrow();
  });
  it("sends only public history and constraints to the model, with no signing credentials", async () => {
    vi.stubEnv("NEAR_AI_API_KEY", "synthetic-near-model-key"); vi.stubEnv("NEAR_AI_MODEL", "test-canonical-model");
    const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.messages[1].content).not.toContain("source_csv");
      expect(body.messages[1].content).not.toContain("ledger_csv");
      expect(body.messages[1].content).not.toContain("buyer_key");
      expect(body.messages[1].content).not.toContain("synthetic-near-model-key");
      expect(body.messages[1].content).not.toContain("synthetic-hiring-secret");
      expect(body.stream).toBe(false);
      return new Response(JSON.stringify({ id: "real-shaped-model-response", model: "test-canonical-model",
        choices: [{ message: { content: JSON.stringify({ build_hash: records[0].hash,
          rationale: "The exact version has accepted work, while the changed version has a rejection." }) } }] }));
    });
    vi.stubGlobal("fetch", fetcher);
    const plan = await planHire(id, "proven", records);
    expect(plan.build_hash).toBe(records[0].hash);
    expect(() => verifyPermit(plan.permit, id, plan.build_hash)).not.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not invent an AI recommendation when configuration is absent", async () => {
    vi.stubEnv("NEAR_AI_API_KEY", "");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(planHire(id, "proven", records)).rejects.toThrow("configuration");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects aliased model responses and malformed response identities without issuing a permit", async () => {
    vi.stubEnv("NEAR_AI_API_KEY", "synthetic-near-model-key");
    vi.stubEnv("NEAR_AI_MODEL", "test-canonical-model");
    for (const identity of [
      { model: "different-model", id: "response-1" },
      { model: "test-canonical-model", id: 42 },
    ]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...identity,
        choices: [{ message: { content: JSON.stringify({ build_hash: records[0].hash,
          rationale: "This version has accepted work with no recorded failures." }) } }],
      }))));
      await expect(planHire(id, "proven", records)).rejects.toThrow("inference identity");
    }
  });
});
