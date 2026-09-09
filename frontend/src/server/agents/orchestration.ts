import type { AgentInputIdentity, AgentResult, AgentRunRecord, PortfolioSnapshot } from "@/server/types";
import { runDecisionAgent } from "@/server/agents/decision";
import { runExecutionAgent } from "@/server/agents/execution";
import { runNewsAgent } from "@/server/agents/news";
import { runOnchainAgent } from "@/server/agents/onchain";
import { runPortfolioAgent } from "@/server/agents/portfolio";
import { runSocialAgent } from "@/server/agents/social";
import {
  buildSkippedByBreakerResult,
  buildSkippedByDeadlineResult,
  buildUnavailableAgentResult,
  runAgentSafely,
} from "@/server/agents/shared";
import {
  createAgentRunId,
  createRunStepMetadata,
  getRunDegradedStatus,
  getRunPartialStatus,
} from "@/server/agents/orchestrationState";
import {
  type AgentBudgetConfig,
  type RunBudgetAccounting,
  DeadlineController,
  RunBudgetTracker,
  resolveBudgetPolicy,
} from "@/server/agents/budget";
import {
  CircuitBreakerOpenError,
  getAgentCircuitBreaker,
} from "@/server/agents/breaker";
import { resolveTokenIdentity } from "@/server/identity/tokenIdentity";
import { createAgentRunRecord, getUserRuleRecord } from "@/server/storage";
import { createTranscriptRecorder, type AgentRunTranscript } from "@/server/evaluation/harness";

export type AgentRunMode = "portfolio_review" | "token_scan" | "pre_buy_check" | "holding_review" | "execution_prepare" | "discovery_candidate";

type AgentOrchestrationInput = {
  mode: AgentRunMode;
  walletAddress?: string;
  identity?: AgentInputIdentity;
  portfolio?: PortfolioSnapshot;
  persistRun?: boolean;
  discoveryContext?: {
    source?: string;
    metrics?: Record<string, unknown>;
  };
  budget?: Partial<AgentBudgetConfig>;
  clock?: () => number;
};

type AgentOrchestrationResult = {
  mode: AgentRunMode;
  identity?: ReturnType<typeof resolveTokenIdentity>;
  dependencyGraph: Record<string, string[]>;
  results: AgentResult[];
  decision: AgentResult;
  runRecord?: AgentRunRecord;
  runId: string;
  partialStatus: ReturnType<typeof getRunPartialStatus>;
  budgetAccounting: RunBudgetAccounting;
  degraded: boolean;
  missingAgents: string[];
  transcript?: AgentRunTranscript;
};

function getRiskiestHolding(portfolio?: PortfolioSnapshot): AgentInputIdentity | undefined {
  const holding = [...(portfolio?.holdings ?? [])].sort((left, right) => {
    const riskGap = right.riskScore - left.riskScore;

    return riskGap !== 0 ? riskGap : right.allocationPercent - left.allocationPercent;
  })[0];

  if (!holding) {
    return undefined;
  }

  return {
    chain: holding.chainId ?? holding.chainName,
    contractAddress: holding.tokenAddress,
    symbol: holding.symbol,
    tokenName: holding.name,
  };
}

function getCandidateHoldings(portfolio?: PortfolioSnapshot): AgentInputIdentity[] {
  return [...(portfolio?.holdings ?? [])]
    .sort((left, right) => {
      const riskGap = right.riskScore - left.riskScore;

      return riskGap !== 0 ? riskGap : right.allocationPercent - left.allocationPercent;
    })
    .slice(0, 3)
    .map((holding) => ({
      chain: holding.chainId ?? holding.chainName,
      contractAddress: holding.tokenAddress.startsWith("0x") ? holding.tokenAddress : undefined,
      symbol: holding.symbol,
      tokenName: holding.name,
    }));
}

async function runWithRunMetadata(
  runId: string,
  agent: AgentResult["agent"],
  task: () => Promise<AgentResult>,
  deadline: DeadlineController,
  tracker: RunBudgetTracker,
  clock?: () => number,
  timeoutMs = 12_000,
): Promise<AgentResult> {
  if (deadline.isExpired) {
    const skipped = buildSkippedByDeadlineResult(agent, "Wall-clock deadline elapsed before agent execution started");
    return {
      ...skipped,
      rawSignals: {
        ...(skipped.rawSignals ?? {}),
        orchestration: createRunStepMetadata(runId, agent),
      },
    };
  }

  const breaker = getAgentCircuitBreaker(agent, { clock });
  const breakerCheck = breaker.canExecute();
  if (!breakerCheck.allowed) {
    const skipped = buildSkippedByBreakerResult(agent, breakerCheck.reason ?? "Circuit breaker is open");
    return {
      ...skipped,
      rawSignals: {
        ...(skipped.rawSignals ?? {}),
        orchestration: createRunStepMetadata(runId, agent),
      },
    };
  }

  const budgetCheck = tracker.canMakeCall(agent);
  if (!budgetCheck.allowed) {
    const skipped = buildSkippedByDeadlineResult(agent, budgetCheck.reason ?? "Monetary ceiling exceeded");
    return {
      ...skipped,
      rawSignals: {
        ...(skipped.rawSignals ?? {}),
        orchestration: createRunStepMetadata(runId, agent),
      },
    };
  }

  const effectiveTimeout = Math.max(1, Math.min(deadline.remainingMs, timeoutMs));

  try {
    const result = await breaker.execute(async () => {
      tracker.recordCall(agent);

      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`${agent} timed out after ${effectiveTimeout}ms`));
        }, effectiveTimeout);

        deadline.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error(`${agent} deadline aborted`));
        }, { once: true });
      });

      return await Promise.race([task(), timeoutPromise]);
    });

    return {
      ...result,
      rawSignals: {
        ...(result.rawSignals ?? {}),
        orchestration: createRunStepMetadata(runId, agent),
      },
    };
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      const skipped = buildSkippedByBreakerResult(agent, error.message);
      return {
        ...skipped,
        rawSignals: {
          ...(skipped.rawSignals ?? {}),
          orchestration: createRunStepMetadata(runId, agent),
        },
      };
    }

    if (deadline.isExpired || (error instanceof Error && (error.message.includes("timed out") || error.message.includes("deadline aborted")))) {
      const skipped = buildSkippedByDeadlineResult(agent, error instanceof Error ? error.message : "Deadline expired");
      return {
        ...skipped,
        rawSignals: {
          ...(skipped.rawSignals ?? {}),
          orchestration: createRunStepMetadata(runId, agent),
        },
      };
    }

    const failed = buildUnavailableAgentResult(agent, error instanceof Error ? error.message : "Agent failed unexpectedly.");
    return {
      ...failed,
      rawSignals: {
        ...(failed.rawSignals ?? {}),
        orchestration: createRunStepMetadata(runId, agent),
      },
    };
  }
}

async function runTokenSpecialists(
  identity: ReturnType<typeof resolveTokenIdentity>,
  runId: string,
  deadline: DeadlineController,
  tracker: RunBudgetTracker,
  clock?: () => number,
) {
  const [onchain, news, social] = await Promise.all([
    runWithRunMetadata(
      runId,
      "onchain",
      () =>
        runOnchainAgent({
          chain: identity.chain,
          contractAddress: identity.contractAddress,
        }),
      deadline,
      tracker,
      clock,
      8_000,
    ),
    runWithRunMetadata(
      runId,
      "news",
      () =>
        runNewsAgent({
          tokenName: identity.tokenName,
          symbol: identity.symbol,
          contractAddress: identity.contractAddress,
          websiteUrl: identity.websiteUrl,
          chain: identity.chain,
        }),
      deadline,
      tracker,
      clock,
      8_000,
    ),
    runWithRunMetadata(
      runId,
      "social",
      () =>
        runSocialAgent({
          tokenName: identity.tokenName,
          symbol: identity.symbol,
          contractAddress: identity.contractAddress,
          websiteUrl: identity.websiteUrl,
          twitterUrl: identity.twitterUrl,
          telegramUrl: identity.telegramUrl,
        }),
      deadline,
      tracker,
      clock,
      8_000,
    ),
  ]);

  return [onchain, news, social];
}

function getDependencyGraph(mode: AgentRunMode) {
  return {
    identity_resolver: ["onchain", "news", "social"],
    portfolio: mode === "portfolio_review" ? ["token_candidates", "decision"] : mode === "holding_review" || mode === "execution_prepare" ? ["identity_resolver", "decision"] : mode === "discovery_candidate" ? ["identity_resolver", "decision"] : [],
    token_candidates: mode === "portfolio_review" ? ["identity_resolver"] : [],
    onchain: ["decision"],
    news: ["decision"],
    social: ["decision"],
    decision: mode === "execution_prepare" ? ["execution"] : [],
    execution: mode === "execution_prepare" ? [] : ["never"],
  };
}

export async function runAgentOrchestration(input: AgentOrchestrationInput): Promise<AgentOrchestrationResult> {
  const runId = createAgentRunId();
  const budgetPolicy = resolveBudgetPolicy(input.budget);
  const deadline = new DeadlineController(budgetPolicy.deadlineMs, input.clock ?? Date.now);
  const tracker = new RunBudgetTracker(runId, budgetPolicy);

  const recorder = createTranscriptRecorder({
    runId,
    chainFamily: input.identity?.chain?.startsWith("stellar") ? "stellar" : "evm",
    network: input.identity?.chain ?? "legacy-evm",
    assetIdentity: { asset: input.identity?.symbol ?? "portfolio" },
    inputSnapshot: { mode: input.mode, walletAddress: input.walletAddress, identity: input.identity },
  }, { enabled: process.env.AGENT_REPLAY_RECORDING === "1" });
  const results: AgentResult[] = [];
  let identityInput = input.identity;
  const candidateInputs: AgentInputIdentity[] = [];

  if (input.mode === "portfolio_review" || input.mode === "holding_review" || input.mode === "execution_prepare") {
    const portfolioResult = await runWithRunMetadata(
      runId,
      "portfolio",
      () => runPortfolioAgent(input.walletAddress),
      deadline,
      tracker,
      input.clock,
      8_000,
    );
    results.push(portfolioResult);
    identityInput = identityInput ?? getRiskiestHolding(input.portfolio);
    candidateInputs.push(...getCandidateHoldings(input.portfolio));
  }

  const identity = identityInput ? resolveTokenIdentity(identityInput) : undefined;

  // Load user rules once so Decision and Execution share the same versioned snapshot
  const userRules = input.walletAddress ? getUserRuleRecord(input.walletAddress) : undefined;

  if (input.mode === "portfolio_review" && candidateInputs.length > 0) {
    for (const candidate of candidateInputs) {
      const candidateIdentity = resolveTokenIdentity(candidate);

      results.push(...(await runTokenSpecialists(candidateIdentity, runId, deadline, tracker, input.clock)));
    }
  } else if (identity && input.mode !== "execution_prepare") {
    results.push(...(await runTokenSpecialists(identity, runId, deadline, tracker, input.clock)));
  }

  tracker.recordCall("decision");
  const decision = runDecisionAgent({
    results,
    context: {
      mode: input.mode,
      walletAddress: input.walletAddress,
      userAlreadyOwnsToken: input.mode === "portfolio_review" || input.mode === "holding_review" || input.mode === "execution_prepare",
      tokenSymbol: identity?.symbol,
      discoveryContext: input.mode === "discovery_candidate"
        ? {
            chainFamily: identity?.chainFamily,
            discoverySource: input.discoveryContext?.source,
            identityConfidence: identity?.confidence ?? 0,
            identityConfidenceLabel: identity?.confidenceLabel ?? "low",
            metrics: input.discoveryContext?.metrics,
          }
        : undefined,
    },
    userRules,
  });
  results.push({
    ...decision,
    rawSignals: {
      ...(decision.rawSignals ?? {}),
      orchestration: createRunStepMetadata(runId, "decision"),
    },
  });

  if (input.mode === "execution_prepare") {
    const execution = await runWithRunMetadata(
      runId,
      "execution",
      () =>
        runExecutionAgent({
          action: decision.recommendedAction,
          walletAddress: input.walletAddress,
          fromToken: identity?.symbol,
          riskScore: decision.riskScore,
          network: identity?.chain,
          rules: userRules,
        }),
      deadline,
      tracker,
      input.clock,
      8_000,
    );

    results.push(execution);
  }

  const partialStatus = getRunPartialStatus(results);
  const degradedStatus = getRunDegradedStatus(results);
  const budgetAccounting = tracker.getAccounting();

  recorder.recordStage("observe", { mode: input.mode }, results.filter((result) => result.agent === "portfolio"));
  recorder.recordStage("analyze", { resultCount: results.length }, results.map((result) => ({ agent: result.agent, riskScore: result.riskScore, confidence: result.confidence })));
  recorder.recordStage("plan", { mode: input.mode }, decision.rawSignals?.executionPlan ?? null);
  recorder.recordStage("decide", { mode: input.mode }, decision);
  const transcript = recorder.finish({ decision, results });

  const runRecord = input.persistRun
    ? await createAgentRunRecord({
        walletAddress: input.walletAddress ?? "unknown",
        mode: input.mode,
        inputSnapshot: {
          mode: input.mode,
          walletAddress: input.walletAddress,
          identity: identityInput,
          candidateCount: candidateInputs.length,
          runId,
          partialStatus,
          degradedStatus,
          budgetAccounting,
        },
        targetToken: identity
          ? {
              symbol: identity.symbol,
              name: identity.tokenName,
              tokenAddress: identity.contractAddress,
              chain: identity.chain,
            }
          : undefined,
        results,
        budgetAccounting,
        degraded: degradedStatus.degraded,
        missingAgents: degradedStatus.missingAgents,
      })
    : undefined;

  return {
    mode: input.mode,
    runId,
    identity,
    dependencyGraph: getDependencyGraph(input.mode),
    results,
    decision,
    partialStatus,
    budgetAccounting,
    degraded: degradedStatus.degraded,
    missingAgents: degradedStatus.missingAgents,
    runRecord,
    transcript,
  };
}
