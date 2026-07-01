import type { AgentFinding, AgentResult, RiskBreakdownItem, RiskLevel, TokenScanResult } from "@/server/types";
import { runOnchainAgent } from "@/server/agents/onchain";
import { getMockTokenScan } from "@/server/scan/mockScan";
import { normalizeTokenInput } from "@/server/scan/tokenInput";

function riskLevel(score: number): RiskLevel {
  if (score >= 85) return "critical";
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function scoreFromSeverity(severity: RiskLevel) {
  return {
    low: 18,
    medium: 48,
    high: 76,
    critical: 94,
  }[severity];
}

function mapFindingToBreakdown(finding: AgentFinding): RiskBreakdownItem {
  const lowerLabel = finding.label.toLowerCase();
  const score = scoreFromSeverity(finding.severity);
  const key: RiskBreakdownItem["key"] = lowerLabel.includes("liquidity")
    ? "liquidity"
    : lowerLabel.includes("volume") || lowerLabel.includes("volatility") || lowerLabel.includes("pair")
      ? "volatility"
      : lowerLabel.includes("creator") || lowerLabel.includes("selling")
        ? "whales"
      : lowerLabel.includes("tax") || lowerLabel.includes("permission") || lowerLabel.includes("contract")
        ? "contract"
        : lowerLabel.includes("holder")
          ? "holders"
          : "scam";

  return {
    key,
    label: finding.label,
    score,
    severity: finding.severity,
    finding: finding.detail,
  };
}

function verdictFromScore(score: number): TokenScanResult["verdict"] {
  if (score >= 85) return "critical";
  if (score >= 70) return "high_risk";
  if (score >= 40) return "watch";
  return "safe";
}

function suggestedActionFromAgent(agent: AgentResult): TokenScanResult["suggestedAction"] {
  if (agent.recommendedAction === "avoid") {
    return {
      type: "hold",
      fromToken: "TOKEN",
      toToken: "USDC",
      percent: 0,
    };
  }

  if (agent.recommendedAction === "manual_review" || agent.recommendedAction === "watch") {
    return {
      type: "hold",
      fromToken: "TOKEN",
      toToken: "USDC",
      percent: 0,
    };
  }

  return {
    type: "hold",
    fromToken: "TOKEN",
    toToken: "USDC",
    percent: 0,
  };
}

export async function runTokenScan(query: string, chain?: string): Promise<TokenScanResult> {
  const normalized = await normalizeTokenInput(query, chain);

  if (!normalized) {
    return getMockTokenScan(query);
  }

  const onchainResult = await runOnchainAgent({
    chain: normalized.chain,
    contractAddress: normalized.contractAddress,
  });
  const riskBreakdown = onchainResult.findings.map(mapFindingToBreakdown);

  return {
    symbol: normalized.symbol ?? "TOKEN",
    tokenAddress: normalized.contractAddress,
    chain: normalized.chain,
    market: normalized.market,
    overallRiskScore: onchainResult.score,
    opportunityScore: Math.max(0, 100 - onchainResult.score),
    verdict: verdictFromScore(onchainResult.score),
    summary: onchainResult.summary,
    reasons: onchainResult.findings.map((finding) => finding.detail),
    suggestedAction: suggestedActionFromAgent(onchainResult),
    riskBreakdown: riskBreakdown.length > 0
      ? riskBreakdown
      : [
          {
            key: "contract",
            label: "Contract security",
            score: onchainResult.score,
            severity: riskLevel(onchainResult.score),
            finding: onchainResult.summary,
          },
        ],
    sources: [
      {
        label: "Input normalization",
        status: "connected",
        detail: `Parsed as ${normalized.source}${normalized.pairAddress ? ` from pair ${normalized.pairAddress}` : ""}.`,
      },
      ...onchainResult.sources.map((source) => ({
        label: source.label,
        status: source.status,
        detail: source.detail ?? "",
      })),
    ],
    scannedAt: onchainResult.createdAt,
  };
}
