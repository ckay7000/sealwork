import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  issueCapability,
  issueChallenge,
  verifyCapability,
  verifyChallenge,
  verifyOrigin,
} from "../../server/security";
describe("sponsored job authorization", () => {
  beforeEach(() => {
    vi.stubEnv(
      "SEALWORK_CONTROL_SECRET",
      "synthetic-test-control-secret-32-characters",
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T00:00:00Z"));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
  it("accepts a fresh creation challenge and rejects tampering and expiration", () => {
    const value = issueChallenge();
    expect(() => verifyChallenge(value)).not.toThrow();
    expect(() => verifyChallenge(value + "x")).toThrow();
    vi.advanceTimersByTime(900001);
    expect(() => verifyChallenge(value)).toThrow();
  });
  it("binds the execution capability to one job", () => {
    const id = "sw_" + "1".repeat(32);
    const capability = issueCapability(id);
    expect(() => verifyCapability(id, capability)).not.toThrow();
    expect(() =>
      verifyCapability("sw_" + "2".repeat(32), capability),
    ).toThrow();
    expect(() => verifyCapability(id, undefined)).toThrow();
  });
  it("rejects a mismatched browser origin", () => {
    expect(() =>
      verifyOrigin("https://sealwork.example", "sealwork.example"),
    ).not.toThrow();
    expect(() =>
      verifyOrigin("https://attacker.example", "sealwork.example"),
    ).toThrow();
  });
  it("fails closed when the control secret is absent", () => {
    vi.stubEnv("SEALWORK_CONTROL_SECRET", "");
    expect(() => issueChallenge()).toThrow();
  });
});
