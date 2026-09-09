import assert from "node:assert/strict";
import {
  resolveBudgetPolicy,
  DEFAULT_BUDGET_POLICY,
  RunBudgetTracker,
  DeadlineController,
} from "../src/server/agents/budget";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  getAgentCircuitBreaker,
  resetAgentCircuitBreakers,
  onCircuitBreakerTransition,
} from "../src/server/agents/breaker";
import {
  buildSkippedByBreakerResult,
  buildSkippedByDeadlineResult,
  buildAgentResult,
} from "../src/server/agents/shared";
import { runDecisionAgent } from "../src/server/agents/decision";
import { runAgentOrchestration } from "../src/server/agents/orchestration";
import type { AgentResult } from "../src/server/types";

/**
 * Validates budget policy resolution, default ceilings, and per-agent limits.
 */
function testBudgetPolicyResolution(): void {
  const defaults = resolveBudgetPolicy();
  assert.equal(defaults.deadlineMs, 10_000);
  assert.equal(defaults.maxCostUsd, 0.50);
  assert.equal(defaults.maxCalls, 20);
  assert.equal(defaults.perAgentMaxCalls.portfolio, 5);
  assert.equal(defaults.perAgentMaxCalls.onchain, 8);
  assert.equal(defaults.perAgentMaxCostUsd.onchain, 0.15);

  const overridden = resolveBudgetPolicy({
    maxDurationMs: 4_000,
    maxTotalSpendUsd: 0.20,
    maxTotalCalls: 10,
    perAgent: {
      portfolio: { maxCalls: 2, maxSpendUsd: 0.04 },
      onchain: { maxCalls: 3, maxSpendUsd: 0.06 },
    },
  });
  assert.equal(overridden.deadlineMs, 4_000);
  assert.equal(overridden.maxCostUsd, 0.20);
  assert.equal(overridden.maxCalls, 10);
  assert.equal(overridden.perAgentMaxCalls.portfolio, 2);
  assert.equal(overridden.perAgentMaxCostUsd.portfolio, 0.04);
}

/**
 * Validates run budget tracker call counts, monetary ceilings, and accounting precision.
 */
function testBudgetTrackerAccounting(): void {
  const policy = resolveBudgetPolicy({
    maxTotalCalls: 3,
    maxTotalSpendUsd: 0.05,
    perAgentMaxCalls: { portfolio: 2 },
  });
  const tracker = new RunBudgetTracker("run-test-1", policy);

  assert.equal(tracker.canMakeCall("portfolio", 0.01).allowed, true);
  tracker.recordCall("portfolio", 0.01);

  assert.equal(tracker.canMakeCall("portfolio", 0.01).allowed, true);
  tracker.recordCall("portfolio", 0.01);

  assert.equal(tracker.canMakeCall("portfolio", 0.01).allowed, false);
  assert.throws(
    () => tracker.recordCall("portfolio", 0.01),
    /Call budget exhausted for agent 'portfolio'/
  );

  assert.equal(tracker.canMakeCall("onchain", 0.01).allowed, true);
  tracker.recordCall("onchain", 0.01);

  assert.equal(tracker.canMakeCall("social", 0.01).allowed, false);
  assert.throws(
    () => tracker.recordCall("social", 0.01),
    /Call budget exhausted for agent 'social'/
  );

  const accounting = tracker.getAccounting();
  assert.equal(accounting.runId, "run-test-1");
  assert.equal(accounting.totalCalls, 3);
  assert.equal(accounting.totalSpendUsd, 0.03);
  assert.equal(accounting.agents.portfolio.calls, 2);
  assert.equal(accounting.agents.portfolio.spendUsd, 0.02);
  assert.equal(accounting.agents.onchain.calls, 1);
  assert.equal(accounting.agents.onchain.spendUsd, 0.01);
  assert.equal(accounting.agents.social.calls, 0);
  assert.equal(accounting.agents.social.spendUsd, 0);
  assert.equal(accounting.exceeded, true);
}

/**
 * Validates wall-clock deadline tracking, remaining calculation, and abort signaling.
 */
function testDeadlineController(): void {
  let virtualTime = 5_000;
  const clock = () => virtualTime;
  const controller = new DeadlineController(1_000, clock);

  assert.equal(controller.isExpired, false);
  assert.equal(controller.getRemainingMs(), 1_000);
  assert.equal(controller.signal.aborted, false);

  virtualTime += 600;
  assert.equal(controller.isExpired, false);
  assert.equal(controller.getRemainingMs(), 400);
  assert.equal(controller.signal.aborted, false);

  virtualTime += 500;
  assert.equal(controller.isExpired, true);
  assert.equal(controller.getRemainingMs(), 0);
  assert.equal(controller.signal.aborted, true);
}

/**
 * Validates circuit breaker fault isolation, cooldown transitions, half-open probing, and logging.
 */
async function testCircuitBreakerLifecycle(): Promise<void> {
  resetAgentCircuitBreakers();

  const transitions: Array<{ agent: string; from: string; to: string }> = [];
  const unsubscribe = onCircuitBreakerTransition((agent, from, to) => {
    transitions.push({ agent, from, to });
  });

  let virtualTime = 100_000;
  const clock = () => virtualTime;

  const breaker = new CircuitBreaker("social", {
    failureThreshold: 2,
    cooldownMs: 20_000,
    clock,
  });

  assert.equal(breaker.getState(), "closed");
  assert.equal(breaker.canExecute().allowed, true);

  await assert.rejects(
    () =>
      breaker.execute(async () => {
        throw new Error("Social API 500");
      }),
    /Social API 500/
  );
  assert.equal(breaker.getState(), "closed");
  assert.equal(breaker.getConsecutiveFailures(), 1);

  await assert.rejects(
    () =>
      breaker.execute(async () => {
        throw new Error("Social API 503");
      }),
    /Social API 503/
  );
  assert.equal(breaker.getState(), "open");
  assert.equal(breaker.canExecute().allowed, false);

  await assert.rejects(
    () => breaker.execute(async () => "unreachable"),
    CircuitBreakerOpenError
  );

  const isolatedBreaker = new CircuitBreaker("onchain", {
    failureThreshold: 2,
    cooldownMs: 20_000,
    clock,
  });
  assert.equal(isolatedBreaker.getState(), "closed");
  const onchainResult = await isolatedBreaker.execute(async () => "onchain-success");
  assert.equal(onchainResult, "onchain-success");

  virtualTime += 20_001;
  assert.equal(breaker.getState(), "half-open");
  assert.equal(breaker.canExecute().allowed, true);

  const probeResult = await breaker.execute(async () => "social-recovered");
  assert.equal(probeResult, "social-recovered");
  assert.equal(breaker.getState(), "closed");
  assert.equal(breaker.getConsecutiveFailures(), 0);

  unsubscribe();
  assert.equal(transitions.length >= 2, true);
}

/**
 * Validates that skipped agent results uphold zero-evidence invariants without score pollution.
 */
function testSkippedAgentNoEvidenceInvariants(): void {
  const breakerSkipped = buildSkippedByBreakerResult(
    "news",
    "Circuit breaker open for news provider"
  );
  assert.equal(breakerSkipped.agent, "news");
  assert.equal(breakerSkipped.confidence, 0);
  assert.equal(breakerSkipped.score, 50);
  assert.equal(breakerSkipped.riskScore, 50);
  assert.equal(breakerSkipped.findings.length, 0);
  assert.equal(breakerSkipped.outcome, "skipped-by-breaker");
  assert.equal(breakerSkipped.executionOutcome?.status, "skipped-by-breaker");
  assert.equal(breakerSkipped.missingData.length > 0, true);

  const deadlineSkipped = buildSkippedByDeadlineResult(
    "social",
    "Deadline of 5000ms elapsed"
  );
  assert.equal(deadlineSkipped.agent, "social");
  assert.equal(deadlineSkipped.confidence, 0);
  assert.equal(deadlineSkipped.findings.length, 0);
  assert.equal(deadlineSkipped.outcome, "skipped-by-deadline");
  assert.equal(deadlineSkipped.executionOutcome?.status, "skipped-by-deadline");

  const activeOnchain = buildAgentResult({
    agent: "onchain",
    score: 85,
    verdict: "High onchain exploit exposure",
    summary: "Suspicious contract structure.",
    findings: [
      {
        label: "Ownership vulnerability",
        severity: "critical",
        detail: "Unprotected transfer function.",
      },
    ],
    recommendedAction: "avoid",
    confidence: 0.9,
    sources: [
      {
        label: "onchain-rpc",
        status: "connected",
        checkedAt: new Date().toISOString(),
        reliability: 0.95,
      },
    ],
  });

  const compositeDecision = runDecisionAgent({
    results: [activeOnchain, breakerSkipped, deadlineSkipped],
  });

  assert.equal(compositeDecision.outcome, "degraded");
  assert.equal(
    compositeDecision.verdict.includes("degraded: missing news, social"),
    true
  );
  assert.equal(
    compositeDecision.summary.includes("[Degraded: signals missing from news, social]"),
    true
  );

  const raw = compositeDecision.rawSignals as Record<string, unknown>;
  assert.equal(raw.isDegraded, true);
  assert.deepEqual(raw.missingAgents, ["news", "social"]);

  const weightedDetails = (
    raw.weightedScore as { details: Array<{ agent: string; weight: number }> }
  ).details;
  assert.equal(
    weightedDetails.some((item) => item.agent === "news"),
    false
  );
  assert.equal(
    weightedDetails.some((item) => item.agent === "social"),
    false
  );
  assert.equal(
    weightedDetails.some((item) => item.agent === "onchain"),
    true
  );
}

/**
 * Validates orchestration execution recording budget accounting, degraded status, and missing agents.
 */
async function testOrchestrationWithBudgetAndBreaker(): Promise<void> {
  resetAgentCircuitBreakers();

  const socialBreaker = getAgentCircuitBreaker("social");
  socialBreaker.recordFailure("Mock upstream failure 1");
  socialBreaker.recordFailure("Mock upstream failure 2");
  socialBreaker.recordFailure("Mock upstream failure 3");
  assert.equal(socialBreaker.getState(), "open");

  const runResult = await runAgentOrchestration({
    mode: "token_scan",
    identity: {
      symbol: "TEST",
      chain: "stellar:pubnet",
      contractAddress: "CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
    },
    walletAddress: "GBWMCCC3NJTN2ZIT2533Q2O2I5M42JLM5CEB64Z2LMV6W274DQ6CQK5N",
    budget: {
      maxTotalCalls: 15,
      maxTotalSpendUsd: 0.30,
    },
  });

  assert.equal(typeof runResult.runId, "string");
  assert.equal(runResult.results.length >= 4, true);

  const socialResult = runResult.results.find((item) => item.agent === "social");
  assert.ok(socialResult);
  assert.equal(socialResult.outcome, "skipped-by-breaker");
  assert.equal(socialResult.confidence, 0);

  const onchainResult = runResult.results.find((item) => item.agent === "onchain");
  assert.ok(onchainResult);

  const decisionResult = runResult.results.find((item) => item.agent === "decision");
  assert.ok(decisionResult);
  assert.equal(decisionResult.outcome, "degraded");

  assert.equal(runResult.degraded, true);
  assert.equal(runResult.missingAgents.includes("social"), true);
  assert.equal(typeof runResult.budgetAccounting.totalSpendUsd, "number");
  assert.equal(typeof runResult.budgetAccounting.totalCalls, "number");
}

/**
 * Main test entry point.
 */
async function main(): Promise<void> {
  testBudgetPolicyResolution();
  testBudgetTrackerAccounting();
  testDeadlineController();
  await testCircuitBreakerLifecycle();
  testSkippedAgentNoEvidenceInvariants();
  await testOrchestrationWithBudgetAndBreaker();
  process.stdout.write("All agent budget and circuit breaker checks passed successfully.\n");
}

main().catch((err) => {
  process.stderr.write(`Verification failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
