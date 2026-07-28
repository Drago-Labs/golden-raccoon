import type { AgentRecommendedAction, AgentResult, PortfolioSnapshot, SimulationResultDetail, TransactionPreview, UserRule } from "@/server/types";
import { buildAgentResult } from "@/server/agents/shared";
import { buildExecutionPolicy, evaluateExecutionPolicy } from "@/server/agents/execution/policy";

type ExecutionAgentInput = {
  action?: AgentRecommendedAction | string;
  walletAddress?: string;
  decisionId?: string;
  fromToken?: string;
  toToken?: string;
  percent?: number;
  riskScore?: number;
  estimatedValueUsd?: number;
  network?: string;
  slippageBps?: number;
  priceImpactBps?: number;
  gasEstimateUsd?: number;
  quoteAvailable?: boolean;
  expectedOutputAmount?: number;
  simulationStatus?: SimulationResultDetail["status"];
  simulationRevertReason?: string;
  simulation?: SimulationResultDetail;
  fresh?: boolean;
  rules?: UserRule;
};

function clampPercent(percent?: number) {
  if (typeof percent !== "number" || !Number.isFinite(percent)) {
    return 0;
  }

  return Math.min(100, Math.max(0, percent));
}

function normalizeAction(action?: string): AgentRecommendedAction {
  if (action === "swap_to_stablecoin") {
    return "swap_to_stable";
  }

  if (
    action === "hold" ||
    action === "watch" ||
    action === "reduce_exposure" ||
    action === "swap_to_stable" ||
    action === "avoid" ||
    action === "manual_review" ||
    action === "prepare_transaction" ||
    action === "no_action"
  ) {
    return action;
  }

  return "no_action";
}

function getActionPlan(action: AgentRecommendedAction) {
  if (action === "hold") return { txAction: "no_action" as const, title: "Hold position", requiresTrade: false, detail: "No transaction is required for hold." };
  if (action === "watch") return { txAction: "watchlist" as const, title: "Add to watchlist/log", requiresTrade: false, detail: "Watch creates an audit/log action only." };
  if (action === "reduce_exposure") return { txAction: "swap" as const, title: "Reduce exposure", requiresTrade: true, detail: "Prepare a partial sell/swap route." };
  if (action === "swap_to_stable") return { txAction: "swap" as const, title: "Swap to stablecoin", requiresTrade: true, detail: "Prepare a stablecoin route." };
  if (action === "avoid") return { txAction: "no_action" as const, title: "Avoid token", requiresTrade: false, detail: "No buy transaction should be prepared." };
  if (action === "manual_review") return { txAction: "no_action" as const, title: "Manual review required", requiresTrade: false, detail: "Manual review blocks transaction preparation." };
  if (action === "prepare_transaction") return { txAction: "swap" as const, title: "Prepare transaction", requiresTrade: true, detail: "Prepare a user-approved transaction preview." };

  return { txAction: "no_action" as const, title: "No action", requiresTrade: false, detail: "No transaction is required." };
}

function estimateProjectedRisk(currentRiskScore: number, percent: number) {
  const reduction = Math.round(percent * 0.6);

  return Math.max(0, currentRiskScore - reduction);
}

function getQuotePlan(input: {
  requiresTrade: boolean;
  fromToken: string;
  toToken: string;
  estimatedValueUsd: number;
  slippageBps: number;
  priceImpactBps: number;
  gasEstimateUsd: number;
  quoteAvailable?: boolean;
  expectedOutputAmount?: number;
}): NonNullable<TransactionPreview["quote"]> | undefined {
  if (!input.requiresTrade) {
    return undefined;
  }

  return {
    provider: "planned_dex_aggregator",
    route: [input.fromToken, input.toToken],
    expectedOutputToken: input.toToken,
    expectedOutputAmount: input.expectedOutputAmount,
    estimatedValueUsd: input.estimatedValueUsd,
    priceImpactBps: input.priceImpactBps,
    slippageBps: input.slippageBps,
    gasEstimateUsd: input.gasEstimateUsd,
    status: input.quoteAvailable ? "planned" : "unavailable",
    detail: input.quoteAvailable
      ? "DEX aggregator quote fields are present for user review."
      : "No live quote provider result is available; this plan is not executable.",
  };
}

function getSimulationPlan(input: {
  requiresTrade: boolean;
  simulationStatus?: SimulationResultDetail["status"];
  revertReason?: string;
  simulation?: SimulationResultDetail;
}): NonNullable<TransactionPreview["simulation"]> {
  if (!input.requiresTrade) {
    return {
      provider: "not_required",
      status: "not_required",
      checks: ["No blockchain transaction required for this action."],
      detail: "Simulation is not required.",
    };
  }

  return {
    provider: input.simulation?.provider ?? "planned_tenderly",
    status: input.simulation?.status ?? input.simulationStatus ?? "pending",
    checks: input.simulation?.checks ?? ["Approval simulation", "Sell/swap simulation", "Revert reason capture", "Slippage and tax sanity check"],
    revertReason: input.simulation?.revertReason ?? input.revertReason,
    revertReasonHuman: input.simulation?.revertReasonHuman,
    detail: input.simulation?.detail
      ?? (input.simulationStatus === "failed"
        ? input.revertReason ?? "Simulation failed."
        : "Tenderly or equivalent simulation is planned before confirmation. Pending simulation blocks unsafe confidence but still allows preview display."),
    simulatedAt: input.simulation?.simulatedAt,
    blockNumber: input.simulation?.blockNumber,
    ledgerSeq: input.simulation?.ledgerSeq,
    quoteExpiry: input.simulation?.quoteExpiry,
    calldataHash: input.simulation?.calldataHash,
    fromAmount: input.simulation?.fromAmount,
    route: input.simulation?.route,
    slippageBps: input.simulation?.slippageBps,
    sequenceNumber: input.simulation?.sequenceNumber,
    fee: input.simulation?.fee,
    balanceChanges: input.simulation?.balanceChanges,
    allowanceRisk: input.simulation?.allowanceRisk,
    trustlineRisk: input.simulation?.trustlineRisk,
    chainFamily: input.simulation?.chainFamily,
  };
}

export function buildExecutionPreview(input: ExecutionAgentInput): TransactionPreview {
  const executionPolicy = buildExecutionPolicy(input.rules);
  const action = normalizeAction(input.action);
  const plan = getActionPlan(action);
  const percent = clampPercent(input.percent ?? (plan.requiresTrade ? 20 : 0));
  const currentRiskScore = Math.min(100, Math.max(0, Math.round(input.riskScore ?? 0)));
  const fromToken = input.fromToken ?? "TOKEN";
  const toToken = input.toToken ?? "USDC";
  const estimatedValueUsd = input.estimatedValueUsd ?? 0;
  const slippageBps = input.slippageBps ?? executionPolicy.maxSlippageBps;
  const priceImpactBps = input.priceImpactBps ?? (estimatedValueUsd > 5_000 ? 180 : estimatedValueUsd > 1_000 ? 75 : 25);
  const gasEstimateUsd = input.gasEstimateUsd ?? (plan.requiresTrade ? 3.5 : 0);
  const simulation = getSimulationPlan({
    requiresTrade: plan.requiresTrade,
    simulationStatus: input.simulationStatus,
    revertReason: input.simulationRevertReason,
    simulation: input.simulation,
  });
  const policyStatus = evaluateExecutionPolicy(
    {
      action,
      percent,
      riskScore: currentRiskScore,
      network: input.network,
      fromToken,
      toToken,
      estimatedValueUsd,
      slippageBps,
      simulationStatus: simulation.status,
    },
    executionPolicy,
  );
  const quote = getQuotePlan({
    requiresTrade: plan.requiresTrade,
    fromToken,
    toToken,
    estimatedValueUsd,
    slippageBps,
    priceImpactBps,
    gasEstimateUsd,
    quoteAvailable: input.quoteAvailable,
    expectedOutputAmount: input.expectedOutputAmount,
  });
  const quoteMissing = plan.requiresTrade && quote?.status !== "planned";
  const blockedReason = policyStatus.violations[0] ?? (quoteMissing ? "Live quote provider result is required before preparing an executable transaction." : undefined);
  const executionReady = plan.requiresTrade && policyStatus.allowed && !quoteMissing;
  const idempotencyKey = input.decisionId ? `${input.walletAddress ?? "unknown"}:${input.decisionId}:${action}:${fromToken}:${toToken}:${percent}` : undefined;
  const preview: TransactionPreview = {
    title: blockedReason
      ? "Transaction blocked by policy"
      : plan.requiresTrade
        ? `${plan.title}: ${percent}% ${fromToken} to ${toToken}`
        : plan.title,
    action: plan.txAction,
    fromToken,
    toToken,
    percent,
    estimatedValueUsd,
    currentRiskScore,
    projectedRiskScore: plan.requiresTrade && executionReady ? estimateProjectedRisk(currentRiskScore, percent) : currentRiskScore,
    requiresApproval: executionReady,
    executionReady,
    network: input.network ?? "GOAT Network",
    slippageBps,
    priceImpactBps,
    gasEstimateUsd,
    policy: {
      maxTradePercent: executionPolicy.maxTradePercent,
      maxRiskScore: executionPolicy.maxRiskScoreForTrade,
      maxMemeExposurePercent: executionPolicy.maxMemeExposurePercent,
      maxDailyTransactionValueUsd: executionPolicy.maxDailyTransactionValueUsd,
      maxSlippageBps: executionPolicy.maxSlippageBps,
      allowedChains: executionPolicy.allowedChains,
      blockedTokens: executionPolicy.blockedTokens,
      allowedActions: Array.from(executionPolicy.allowedActions),
      autoExecute: false,
    },
    policyStatus,
    quote,
    simulation,
    approvalRisk: {
      infiniteApprovalWarning: plan.requiresTrade,
      existingAllowanceCheck: plan.requiresTrade ? "required" : "not_required",
      revokeSuggestion: plan.requiresTrade ? `Review and revoke unused ${fromToken} allowance after execution.` : undefined,
      permitSupport: "planned",
      permit2Support: "planned",
    },
    lifecycle: {
      status: blockedReason ? "expired" : "prepared",
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      idempotencyKey,
    },
    audit: {
      approvalRequired: executionReady,
      serverCanSign: false,
      userRuleWallet: executionPolicy.walletAddress,
      userApproved: false,
      decisionId: input.decisionId,
    },
    approvalSteps: plan.requiresTrade
      ? ["Review agent reasoning", "Review quote and policy status", "Run/confirm simulation", "Approve in connected wallet", "Save transaction hash after broadcast"]
      : [plan.detail],
  };

  if (blockedReason) {
    preview.blockedReason = blockedReason;
  }

  return preview;
}

export function buildExecutionPreviewFromPortfolio(portfolio: PortfolioSnapshot, input: ExecutionAgentInput): TransactionPreview {
  const fromToken = input.fromToken ?? portfolio.holdings.find((holding) => holding.riskScore >= 70)?.symbol ?? portfolio.holdings[0]?.symbol ?? "TOKEN";
  const percent = clampPercent(input.percent ?? 30);
  const holding = portfolio.holdings.find((item) => item.symbol === fromToken);
  const estimatedValueUsd = input.estimatedValueUsd ?? (holding ? holding.valueUsd * (percent / 100) : 0);

  return buildExecutionPreview({
    ...input,
    fromToken,
    toToken: input.toToken ?? "USDC",
    percent,
    estimatedValueUsd,
    riskScore: input.riskScore ?? portfolio.riskScore,
    network: input.network ?? portfolio.holdings.find((item) => item.symbol === fromToken)?.chainName ?? "GOAT Network",
  });
}

export function runExecutionAgent(input: ExecutionAgentInput): AgentResult {
  const action = normalizeAction(input.action);
  const preview = buildExecutionPreview(input);
  const blocked = Boolean(preview.blockedReason);
  const policyViolations = preview.policyStatus?.violations ?? [];
  const score = blocked ? 76 : preview.requiresApproval ? 38 : 18;

  return buildAgentResult({
    agent: "execution",
    score,
    verdict: blocked ? "Execution blocked by policy" : preview.requiresApproval ? "Approval required" : "No transaction required",
    summary: blocked
      ? preview.blockedReason ?? "Execution policy blocked this plan."
      : preview.requiresApproval
        ? `Prepared approval-only ${action.replaceAll("_", " ")} plan. Auto-execute is disabled.`
        : "No wallet transaction is required for this action.",
    findings: [
      {
        label: "Approval-only guard",
        severity: "low",
        detail: "Auto-execute is disabled. The server cannot sign; every blockchain action requires explicit user wallet approval.",
      },
      {
        label: "Policy evaluation",
        severity: policyViolations.length > 0 ? "high" : "low",
        detail: policyViolations.length > 0 ? policyViolations.join(" ") : "Action, trade size, risk score, chain, slippage and token policy checks passed.",
      },
      {
        label: "Quote provider plan",
        severity: preview.quote?.status === "unavailable" ? "high" : preview.quote ? "medium" : "low",
        detail: preview.quote?.detail ?? "No quote required for this action.",
      },
      {
        label: "Approval risk analysis",
        severity: preview.approvalRisk?.infiniteApprovalWarning ? "medium" : "low",
        detail: preview.approvalRisk?.infiniteApprovalWarning
          ? `${preview.approvalRisk.existingAllowanceCheck} allowance check. ${preview.approvalRisk.revokeSuggestion ?? ""} Permit support ${preview.approvalRisk.permitSupport}; Permit2 ${preview.approvalRisk.permit2Support}.`
          : "No token approval risk for this non-transaction action.",
        raw: JSON.stringify(preview.approvalRisk),
      },
      {
        label: "Transaction lifecycle",
        severity: preview.lifecycle?.status === "expired" || preview.lifecycle?.status === "failed" ? "medium" : "low",
        detail: `Lifecycle status ${preview.lifecycle?.status ?? "prepared"}; duplicate prepare key ${preview.lifecycle?.idempotencyKey ?? "not supplied"}.`,
        raw: JSON.stringify(preview.lifecycle),
      },
      {
        label: "Simulation plan",
        severity: preview.simulation?.status === "failed" ? "high" : preview.simulation?.status === "pending" ? "medium" : "low",
        detail: preview.simulation?.detail ?? "No simulation status available.",
      },
    ],
    sources: [
      {
        label: "Execution policy",
        status: "connected",
        detail: "Local approval-only policy loaded from user rules. No transaction is sent by the server.",
      },
      {
        label: "Quote provider",
        status: preview.quote ? "unavailable" : "connected",
        detail: preview.quote?.detail ?? "Quote provider not required for non-transaction action.",
      },
      {
        label: "Simulation provider",
        status: preview.simulation?.status === "not_required" ? "connected" : "unavailable",
        detail: preview.simulation?.detail ?? "Simulation provider status unavailable.",
      },
    ],
    confidence: blocked ? 0.7 : preview.requiresApproval ? 0.66 : 0.74,
    recommendedAction: preview.requiresApproval ? "prepare_transaction" : "no_action",
    blockingReasons: policyViolations,
    rawSignals: {
      preview,
      policyStatus: preview.policyStatus,
      quote: preview.quote,
      simulation: preview.simulation,
      approvalRisk: preview.approvalRisk,
      lifecycle: preview.lifecycle,
      approvalOnly: {
        autoExecute: false,
        serverCanSign: false,
        userWalletApprovalRequired: preview.requiresApproval,
      },
      semiAutoFuturePolicy: {
        autoBuy: false,
        sellReduceOnlyWithExplicitOptIn: true,
        dailyLimitRequired: true,
        allowlistRequired: true,
        emergencyPauseRequired: true,
        everyTransactionAudited: true,
      },
    },
  });
}
