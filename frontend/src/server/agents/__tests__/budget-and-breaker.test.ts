import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveBudgetPolicy,
  DEFAULT_BUDGET_POLICY,
  RunBudgetTracker,
  DeadlineController,
} from "../budget";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  getAgentCircuitBreaker,
  resetAgentCircuitBreakers,
} from "../breaker";
import {
  buildSkippedByBreakerResult,
  buildSkippedByDeadlineResult,
  buildAgentResult,
} from "../shared";
import { runDecisionAgent } from "../decision";

describe("Agent Budget Policy & Tracker", () => {
  it("resolves default budget policy with expected ceilings and costs", () => {
    const policy = resolveBudgetPolicy();
    expect(policy.maxDurationMs).toBe(10_000);
    expect(policy.maxTotalSpendUsd).toBe(0.5);
    expect(policy.maxTotalCalls).toBe(20);
    expect(policy.perAgent.onchain.maxCalls).toBe(8);
    expect(policy.callCosts.onchain).toBe(0.015);
  });

  it("merges custom overrides into resolved budget policy", () => {
    const policy = resolveBudgetPolicy({
      maxDurationMs: 5_000,
      maxTotalSpendUsd: 0.25,
      perAgent: {
        portfolio: { maxCalls: 2, maxSpendUsd: 0.05 },
        social: { maxCalls: 1, maxSpendUsd: 0.02 },
        news: { maxCalls: 2, maxSpendUsd: 0.04 },
        onchain: { maxCalls: 3, maxSpendUsd: 0.06 },
        decision: { maxCalls: 1, maxSpendUsd: 0.02 },
        execution: { maxCalls: 1, maxSpendUsd: 0.02 },
      },
    });
    expect(policy.maxDurationMs).toBe(5_000);
    expect(policy.maxTotalSpendUsd).toBe(0.25);
    expect(policy.perAgent.portfolio.maxCalls).toBe(2);
    expect(policy.perAgent.onchain.maxCalls).toBe(3);
  });

  it("enforces call limits and halts further upstream calls in run", () => {
    const policy = resolveBudgetPolicy({
      maxTotalCalls: 2,
      maxTotalSpendUsd: 1.0,
    });
    const tracker = new RunBudgetTracker(policy);

    expect(tracker.canMakeCall("portfolio").allowed).toBe(true);
    tracker.recordCall("portfolio");

    expect(tracker.canMakeCall("onchain").allowed).toBe(true);
    tracker.recordCall("onchain");

    expect(tracker.canMakeCall("social").allowed).toBe(false);
    expect(() => tracker.recordCall("social")).toThrow(/Call budget exhausted/);
  });

  it("enforces spend limits and halts calls once monetary ceiling is hit", () => {
    const policy = resolveBudgetPolicy({
      maxTotalSpendUsd: 0.02,
      callCosts: {
        portfolio: 0.01,
        social: 0.01,
        news: 0.01,
        onchain: 0.02,
        decision: 0.01,
        execution: 0.01,
      },
    });
    const tracker = new RunBudgetTracker(policy);

    expect(tracker.canMakeCall("portfolio").allowed).toBe(true);
    tracker.recordCall("portfolio");

    expect(tracker.canMakeCall("social").allowed).toBe(true);
    tracker.recordCall("social");

    expect(tracker.canMakeCall("news").allowed).toBe(false);
    expect(() => tracker.recordCall("news")).toThrow(/budget exhausted/i);
  });

  it("produces accurate run-level budget accounting with clean rounding", () => {
    const policy = resolveBudgetPolicy();
    const tracker = new RunBudgetTracker(policy);

    tracker.recordCall("portfolio");
    tracker.recordCall("onchain");
    tracker.recordCall("social");

    const accounting = tracker.getAccounting();
    expect(accounting.totalCalls).toBe(3);
    expect(accounting.totalSpendUsd).toBe(
      Math.round(
        (policy.callCosts.portfolio +
          policy.callCosts.onchain +
          policy.callCosts.social) *
          10_000
      ) / 10_000
    );
    expect(accounting.agents.portfolio.calls).toBe(1);
    expect(accounting.agents.onchain.calls).toBe(1);
    expect(accounting.agents.social.calls).toBe(1);
    expect(accounting.agents.news.calls).toBe(0);
  });
});

describe("Deadline Controller", () => {
  it("tracks remaining time and expires cleanly", () => {
    let mockTime = 1_000;
    const clock = () => mockTime;
    const deadline = new DeadlineController(500, clock);

    expect(deadline.isExpired).toBe(false);
    expect(deadline.getRemainingMs()).toBe(500);

    mockTime = 1_300;
    expect(deadline.isExpired).toBe(false);
    expect(deadline.getRemainingMs()).toBe(200);

    mockTime = 1_500;
    expect(deadline.isExpired).toBe(true);
    expect(deadline.getRemainingMs()).toBe(0);
    expect(deadline.signal.aborted).toBe(true);
  });
});

describe("Circuit Breaker Subsystem", () => {
  beforeEach(() => {
    resetAgentCircuitBreakers();
  });

  it("remains closed during successful calls and isolates failures per agent", async () => {
    const breakerA = new CircuitBreaker("social", { failureThreshold: 3, cooldownMs: 1_000 });
    const breakerB = new CircuitBreaker("onchain", { failureThreshold: 3, cooldownMs: 1_000 });

    await breakerA.execute(async () => "ok A");
    await breakerB.execute(async () => "ok B");

    expect(breakerA.getState()).toBe("closed");
    expect(breakerB.getState()).toBe("closed");

    for (let i = 0; i < 3; i++) {
      await expect(
        breakerA.execute(async () => {
          throw new Error("RPC error");
        })
      ).rejects.toThrow("RPC error");
    }

    expect(breakerA.getState()).toBe("open");
    expect(breakerA.canExecute().allowed).toBe(false);

    expect(breakerB.getState()).toBe("closed");
    expect(breakerB.canExecute().allowed).toBe(true);
    await expect(breakerB.execute(async () => "still working")).resolves.toBe("still working");
  });

  it("transitions to half-open after cooldown and closes on successful probe", async () => {
    let mockTime = 10_000;
    const clock = () => mockTime;
    const breaker = new CircuitBreaker("news", {
      failureThreshold: 2,
      cooldownMs: 5_000,
      clock,
    });

    for (let i = 0; i < 2; i++) {
      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");
    }

    expect(breaker.getState()).toBe("open");

    await expect(breaker.execute(async () => "blocked")).rejects.toThrow(CircuitBreakerOpenError);

    mockTime += 5_001;
    expect(breaker.getState()).toBe("half-open");

    const probeResult = await breaker.execute(async () => "probe-success");
    expect(probeResult).toBe("probe-success");
    expect(breaker.getState()).toBe("closed");
    expect(breaker.getConsecutiveFailures()).toBe(0);
  });

  it("reopens after failed probe without resetting cooldown cycle", async () => {
    let mockTime = 10_000;
    const clock = () => mockTime;
    const breaker = new CircuitBreaker("portfolio", {
      failureThreshold: 2,
      cooldownMs: 5_000,
      clock,
    });

    for (let i = 0; i < 2; i++) {
      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");
    }

    mockTime += 5_001;
    expect(breaker.getState()).toBe("half-open");

    await expect(
      breaker.execute(async () => {
        throw new Error("probe-failure");
      })
    ).rejects.toThrow("probe-failure");

    expect(breaker.getState()).toBe("open");
    expect(breaker.canExecute().allowed).toBe(false);
  });

  it("retrieves isolated instances per agent from registry", () => {
    const onchainBreaker1 = getAgentCircuitBreaker("onchain");
    const onchainBreaker2 = getAgentCircuitBreaker("onchain");
    const newsBreaker = getAgentCircuitBreaker("news");

    expect(onchainBreaker1).toBe(onchainBreaker2);
    expect(onchainBreaker1).not.toBe(newsBreaker);
    expect(onchainBreaker1.getAgent()).toBe("onchain");
    expect(newsBreaker.getAgent()).toBe("news");
  });
});

describe("No-Evidence Invariants on Skipped Agents", () => {
  it("builds skipped-by-breaker result with zero confidence and non-polluting neutral score", () => {
    const result = buildSkippedByBreakerResult("social", "Circuit breaker open: 3 consecutive failures");

    expect(result.agent).toBe("social");
    expect(result.confidence).toBe(0);
    expect(result.score).toBe(50);
    expect(result.riskScore).toBe(50);
    expect(result.findings).toHaveLength(0);
    expect(result.outcome).toBe("skipped-by-breaker");
    expect(result.executionOutcome?.status).toBe("skipped-by-breaker");
    expect(result.executionOutcome?.reason).toContain("Circuit breaker open");
    expect(result.missingData.length).toBeGreaterThan(0);
    expect(result.missingData[0].reason).toContain("Circuit breaker open");
  });

  it("builds skipped-by-deadline result with zero confidence and non-polluting neutral score", () => {
    const result = buildSkippedByDeadlineResult("news", "Execution deadline of 10000ms elapsed");

    expect(result.agent).toBe("news");
    expect(result.confidence).toBe(0);
    expect(result.score).toBe(50);
    expect(result.findings).toHaveLength(0);
    expect(result.outcome).toBe("skipped-by-deadline");
    expect(result.executionOutcome?.status).toBe("skipped-by-deadline");
    expect(result.missingData[0].reason).toContain("Execution deadline");
  });

  it("propagates degraded state into composite decision verdict without polluting weighted score", () => {
    const onchainResult = buildAgentResult({
      agent: "onchain",
      score: 80,
      verdict: "High onchain risk",
      summary: "Potential trap detected.",
      findings: [{ label: "Honeypot risk", severity: "high", detail: "Suspicious contract characteristics." }],
      recommendedAction: "avoid",
      confidence: 0.8,
      sources: [{ label: "onchain-source", status: "connected", checkedAt: new Date().toISOString(), reliability: 0.85 }],
    });

    const skippedSocial = buildSkippedByBreakerResult("social", "Circuit breaker open for social agent");
    const skippedNews = buildSkippedByDeadlineResult("news", "Deadline expired before news agent");

    const decision = runDecisionAgent({
      results: [onchainResult, skippedSocial, skippedNews],
    });

    expect(decision.outcome).toBe("degraded");
    expect(decision.verdict).toContain("degraded");
    expect(decision.verdict).toContain("missing social, news");
    expect(decision.summary).toContain("[Degraded: signals missing from social, news]");

    const raw = decision.rawSignals as Record<string, unknown>;
    expect(raw.isDegraded).toBe(true);
    expect(raw.missingAgents).toEqual(["social", "news"]);
    expect(raw.skippedAgents).toEqual(["social", "news"]);

    const weightedDetails = (raw.weightedScore as { details: { agent: string; weight: number }[] }).details;
    expect(weightedDetails.some((d) => d.agent === "social")).toBe(false);
    expect(weightedDetails.some((d) => d.agent === "news")).toBe(false);
    expect(weightedDetails.some((d) => d.agent === "onchain")).toBe(true);
  });
});
