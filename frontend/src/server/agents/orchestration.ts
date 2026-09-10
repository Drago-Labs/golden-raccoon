import { createRunDeadline, withinAgentDeadline, AgentDeadlineError } from "./deadline";
import type { AgentInputIdentity, AgentResult, AgentRunRecord, PortfolioSnapshot } from "@/server/types";
import { runDecisionAgent } from "@/server/agents/decision";
import { runExecutionAgent } from "@/server/agents/execution";
import { runNewsAgent } from "@/server/agents/news";
import { runOnchainAgent } from "@/server/agents/onchain";
import { runPortfolioAgent } from "@/server/agents/portfolio";
import { runSocialAgent } from "@/server/agents/social";
import { runAgentSafely } from "@/server/agents/shared";
import { createAgentRunId, createRunStepMetadata, getRunPartialStatus } from "@/server/agents/orchestrationState";
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

async function runWithRunMetadata(runId: string, deadline: number, agent: AgentResult["agent"], task: () => Promise<AgentResult>, timeoutMs = 12_000) {
  let deadlineExceeded = false;
  const result = await runAgentSafely(agent, async () => {
    try { return await withinAgentDeadline(deadline, timeoutMs, task); }
    catch (error) { deadlineExceeded = error instanceof AgentDeadlineError; throw error; }
  });

  return {
    ...result,
    rawSignals: {
      ...(result.rawSignals ?? {}),
      orchestration: { ...createRunStepMetadata(runId, agent), outcome: deadlineExceeded ? "skipped-by-deadline" : "completed" },
    },
  };
}

async function runTokenSpecialists(identity: ReturnType<typeof resolveTokenIdentity>, runId: string, deadline: number) {
  const [onchain, news, social] = await Promise.all([
    runWithRunMetadata(runId, deadline, "onchain", () =>
      runOnchainAgent({
        chain: identity.chain,
        contractAddress: identity.contractAddress,
      }),
    ),
    runWithRunMetadata(runId, deadline, "news", () =>
      runNewsAgent({
        tokenName: identity.tokenName,
        symbol: identity.symbol,
        contractAddress: identity.contractAddress,
        websiteUrl: identity.websiteUrl,
        chain: identity.chain,
      }),
    ),
    runWithRunMetadata(runId, deadline, "social", () =>
      runSocialAgent({
        tokenName: identity.tokenName,
        symbol: identity.symbol,
        contractAddress: identity.contractAddress,
        websiteUrl: identity.websiteUrl,
        twitterUrl: identity.twitterUrl,
        telegramUrl: identity.telegramUrl,
      }),
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
  const deadline = createRunDeadline();
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
    const portfolioResult = await runWithRunMetadata(runId, deadline, "portfolio", () => runPortfolioAgent(input.walletAddress), 8_000);
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

      results.push(...(await runTokenSpecialists(candidateIdentity, runId, deadline)));
    }
  } else if (identity && input.mode !== "execution_prepare") {
    results.push(...(await runTokenSpecialists(identity, runId, deadline)));
  }

  const isDeadlineSkipped = (result: AgentResult) =>
    (result.rawSignals?.orchestration as { outcome?: string } | undefined)?.outcome === "skipped-by-deadline";
  const decision = runDecisionAgent({
    results: results.filter(result => !isDeadlineSkipped(result)),
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
  if (results.some(isDeadlineSkipped)) {
    decision.confidence = Math.min(decision.confidence, 0.18);
    decision.recommendedAction = "manual_review";
    decision.status = "blocked";
    decision.blockingReasons = [...(decision.blockingReasons ?? []), "Run deadline left required agent evidence unavailable."];
    if (decision.dataQuality) decision.dataQuality = { ...decision.dataQuality, mode: "partial", detail: "Run deadline left required agent evidence unavailable." };
  }
  results.push({
    ...decision,
    rawSignals: {
      ...(decision.rawSignals ?? {}),
      orchestration: createRunStepMetadata(runId, "decision"),
    },
  });

  if (input.mode === "execution_prepare") {
    const execution = await runWithRunMetadata(runId, deadline, "execution", () =>
      runExecutionAgent({
        action: decision.recommendedAction,
        walletAddress: input.walletAddress,
        fromToken: identity?.symbol,
        riskScore: decision.riskScore,
        network: identity?.chain,
        rules: userRules,
      }),
    );

    results.push(execution);
  }

  const partialStatus = getRunPartialStatus(results);
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
    runRecord,
    transcript,
  };
}
