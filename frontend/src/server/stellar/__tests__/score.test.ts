import { describe, expect, it } from "vitest";
import { computeEndpointScore } from "../probes/score";

describe("Deterministic RPC Endpoint Scoring", () => {
  const fixedNow = 1_700_000_000_000;

  it("produces deterministic 100 score for a fast, perfectly healthy endpoint", () => {
    const outcome = {
      ok: true,
      latencyMs: 50,
      timestamp: fixedNow,
      ledgerHeight: 500,
      lag: 0,
    };
    const history = [outcome, outcome, outcome];

    const result1 = computeEndpointScore(history, { now: fixedNow });
    const result2 = computeEndpointScore(history, { now: fixedNow });

    expect(result1.score).toBe(result2.score);
    expect(result1.score).toBe(100);
    expect(result1.state).toBe("healthy");
    expect(result1.breakdown.latencyPenalty).toBe(0);
    expect(result1.breakdown.failurePenalty).toBe(0);
    expect(result1.breakdown.lagPenalty).toBe(0);
  });

  it("penalizes high latency appropriately", () => {
    const slowSamples = [
      { ok: true, latencyMs: 800, timestamp: fixedNow, lag: 0 },
      { ok: true, latencyMs: 900, timestamp: fixedNow, lag: 0 },
    ];

    const result = computeEndpointScore(slowSamples, { now: fixedNow });

    expect(result.score).toBeLessThan(100);
    expect(result.breakdown.latencyPenalty).toBeGreaterThan(0);
    expect(result.state).toBe("healthy");
  });

  it("marks endpoint unhealthy when stale lagging behind network head", () => {
    const staleSamples = [
      { ok: true, latencyMs: 50, timestamp: fixedNow, ledgerHeight: 490, lag: 10 },
    ];

    const result = computeEndpointScore(staleSamples, { now: fixedNow });

    expect(result.score).toBeLessThan(30);
    expect(result.state).toBe("unhealthy");
    expect(result.breakdown.lagPenalty).toBe(80);
  });

  it("marks endpoint degraded when intermittent failures occur", () => {
    const mixedSamples = [
      { ok: false, latencyMs: 1200, timestamp: fixedNow - 3000, errorCode: "timeout" as const, lag: 0 },
      { ok: true, latencyMs: 100, timestamp: fixedNow - 2000, lag: 0 },
      { ok: false, latencyMs: 1100, timestamp: fixedNow - 1000, errorCode: "transport_error" as const, lag: 0 },
      { ok: true, latencyMs: 100, timestamp: fixedNow, lag: 0 },
    ];

    const result = computeEndpointScore(mixedSamples, { now: fixedNow });

    expect(result.score).toBeLessThan(70);
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.state).toBe("degraded");
  });

  it("marks endpoint unhealthy when consecutive failures reach threshold", () => {
    const failedSamples = [
      { ok: false, latencyMs: 2000, timestamp: fixedNow - 1000, errorCode: "rpc_error" as const, lag: 0 },
      { ok: false, latencyMs: 2000, timestamp: fixedNow, errorCode: "rpc_error" as const, lag: 0 },
    ];

    const result = computeEndpointScore(failedSamples, { now: fixedNow });

    expect(result.state).toBe("unhealthy");
    expect(result.score).toBeLessThan(30);
  });
});
