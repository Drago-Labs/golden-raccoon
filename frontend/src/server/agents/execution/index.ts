import type { AgentRecommendedAction, AgentResult, PortfolioSnapshot, TransactionPreview } from "@/server/types";
import { buildAgentResult } from "@/server/agents/shared";

type ExecutionAgentInput = {
  action?: AgentRecommendedAction | string;
  walletAddress?: string;
  fromToken?: string;
  toToken?: string;
  percent?: number;
  riskScore?: number;
  estimatedValueUsd?: number;
  network?: string;
};

const executionPolicy = {
  autoExecute: false,
  maxTradePercent: 30,
  maxRiskScoreForTrade: 70,
  defaultSlippageBps: 100,
  allowedActions: new Set(["reduce_exposure", "swap_to_stable", "prepare_transaction", "watch", "hold", "no_action"]),
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

function getBlockedReason(action: AgentRecommendedAction, percent: number, riskScore: number) {
  if (!executionPolicy.allowedActions.has(action)) {
    return `Action ${action} is not allowed by execution policy.`;
  }

  if (action === "avoid" || action === "manual_review") {
    return `Action ${action.replaceAll("_", " ")} cannot prepare a transaction until the user reviews the risk.`;
  }

  if (percent > executionPolicy.maxTradePercent) {
    return `Requested ${percent}% exceeds max trade percent ${executionPolicy.maxTradePercent}%.`;
  }

  if ((action === "swap_to_stable" || action === "reduce_exposure" || action === "prepare_transaction") && riskScore > executionPolicy.maxRiskScoreForTrade) {
    return `Risk score ${riskScore} exceeds max trade risk threshold ${executionPolicy.maxRiskScoreForTrade}.`;
  }

  return undefined;
}

function estimateProjectedRisk(currentRiskScore: number, percent: number) {
  const reduction = Math.round(percent * 0.6);

  return Math.max(0, currentRiskScore - reduction);
}

export function buildExecutionPreview(input: ExecutionAgentInput): TransactionPreview {
  const action = normalizeAction(input.action);
  const percent = clampPercent(input.percent);
  const currentRiskScore = Math.min(100, Math.max(0, Math.round(input.riskScore ?? 0)));
  const blockedReason = getBlockedReason(action, percent, currentRiskScore);
  const hasTradeAction = action === "swap_to_stable" || action === "reduce_exposure" || action === "prepare_transaction";
  const preview: TransactionPreview = {
    title: blockedReason
      ? "Transaction blocked by policy"
      : hasTradeAction
        ? `${percent}% ${input.fromToken ?? "TOKEN"} to ${input.toToken ?? "USDC"} plan`
        : "No transaction required",
    action: hasTradeAction ? "swap" : action === "watch" ? "watchlist" : "no_action",
    fromToken: input.fromToken ?? "TOKEN",
    toToken: input.toToken ?? "USDC",
    percent,
    estimatedValueUsd: input.estimatedValueUsd ?? 0,
    currentRiskScore,
    projectedRiskScore: hasTradeAction && !blockedReason ? estimateProjectedRisk(currentRiskScore, percent) : currentRiskScore,
    requiresApproval: hasTradeAction && !blockedReason,
    network: input.network ?? "GOAT Network",
    slippageBps: executionPolicy.defaultSlippageBps,
    approvalSteps: [
      "Review agent reasoning",
      "Review wallet transaction details",
      "Approve in connected wallet",
      "Save transaction hash after broadcast",
    ],
  };

  if (blockedReason) {
    preview.blockedReason = blockedReason;
  }

  return preview;
}

export function buildExecutionPreviewFromPortfolio(portfolio: PortfolioSnapshot, input: ExecutionAgentInput): TransactionPreview {
  const fromToken = input.fromToken ?? portfolio.holdings.find((holding) => holding.riskScore >= 70)?.symbol ?? "TOKEN";
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
  const percent = clampPercent(input.percent);
  const riskScore = Math.min(100, Math.max(0, Math.round(input.riskScore ?? 0)));
  const preview = buildExecutionPreview(input);
  const blocked = Boolean(preview.blockedReason);

  return buildAgentResult({
    agent: "execution",
    score: blocked ? 76 : percent > executionPolicy.maxTradePercent * 0.75 ? 52 : 24,
    verdict: blocked ? "Execution blocked by policy" : preview.requiresApproval ? "Approval required" : "No transaction required",
    summary: blocked
      ? preview.blockedReason ?? "Execution policy blocked this plan."
      : preview.requiresApproval
        ? `Prepared approval-only ${action.replaceAll("_", " ")} plan. Auto-execute is disabled.`
        : "No wallet transaction is required for this action.",
    findings: [
      {
        label: "Approval policy",
        severity: "low",
        detail: "Auto-execute is disabled. Every blockchain action requires explicit user wallet approval.",
      },
      {
        label: "Trade size",
        severity: percent > executionPolicy.maxTradePercent ? "high" : percent > executionPolicy.maxTradePercent * 0.75 ? "medium" : "low",
        detail: `Requested ${percent}%; policy max is ${executionPolicy.maxTradePercent}%.`,
      },
      {
        label: "Risk threshold",
        severity: riskScore > executionPolicy.maxRiskScoreForTrade ? "high" : "low",
        detail: `Current risk score ${riskScore}; policy threshold for trade prep is ${executionPolicy.maxRiskScoreForTrade}.`,
      },
    ],
    sources: [
      {
        label: "Execution policy",
        status: "mock",
        detail: "Local approval-only MVP policy. No transaction is sent by the server.",
      },
    ],
    confidence: 0.72,
    recommendedAction: preview.requiresApproval ? "prepare_transaction" : "no_action",
  });
}
