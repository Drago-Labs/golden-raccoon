import type { AgentFinding, AgentResult, RiskBreakdownItem, RiskLevel, TokenScanResult } from "@/server/types";
import { runNewsAgent } from "@/server/agents/news";
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
    : lowerLabel.includes("fdv")
      ? "liquidity"
    : lowerLabel.includes("volume") || lowerLabel.includes("volatility") || lowerLabel.includes("pair") || lowerLabel.includes("anomaly")
      ? "volatility"
      : lowerLabel.includes("creator") || lowerLabel.includes("selling")
        ? "whales"
      : lowerLabel.includes("news") || lowerLabel.includes("catalyst") || lowerLabel.includes("regulatory") || lowerLabel.includes("scam")
        ? "scam"
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

function combineAgentScores(onchainResult: AgentResult, newsResult: AgentResult) {
  const newsHasConnectedSource = newsResult.sources.some((source) => source.status === "connected");
  const newsWeight = newsHasConnectedSource ? 0.25 : 0.1;
  const onchainWeight = 1 - newsWeight;

  return Math.round(onchainResult.score * onchainWeight + newsResult.score * newsWeight);
}

function combinedSuggestedAction(score: number): TokenScanResult["suggestedAction"] {
  return {
    type: score >= 70 ? "hold" : "hold",
    fromToken: "TOKEN",
    toToken: "USDC",
    percent: 0,
  };
}

function verdictFromScore(score: number): TokenScanResult["verdict"] {
  if (score >= 85) return "critical";
  if (score >= 70) return "high_risk";
  if (score >= 40) return "watch";
  return "safe";
}

export async function runTokenScan(query: string, chain?: string): Promise<TokenScanResult> {
  const normalized = await normalizeTokenInput(query, chain);

  if (!normalized) {
    return getMockTokenScan(query);
  }

  const [onchainResult, newsResult] = await Promise.all([
    runOnchainAgent({
      chain: normalized.chain,
      contractAddress: normalized.contractAddress,
    }),
    runNewsAgent({
      symbol: normalized.symbol,
      tokenName: normalized.name,
      contractAddress: normalized.contractAddress,
    }),
  ]);
  const overallRiskScore = combineAgentScores(onchainResult, newsResult);
  const combinedFindings = [...onchainResult.findings, ...newsResult.findings];
  const riskBreakdown = combinedFindings.map(mapFindingToBreakdown);

  return {
    symbol: normalized.symbol ?? "TOKEN",
    tokenAddress: normalized.contractAddress,
    chain: normalized.chain,
    market: normalized.market,
    overallRiskScore,
    opportunityScore: Math.max(0, 100 - overallRiskScore),
    verdict: verdictFromScore(overallRiskScore),
    summary: `${onchainResult.summary} ${newsResult.summary}`,
    reasons: combinedFindings.map((finding) => finding.detail).slice(0, 10),
    suggestedAction: combinedSuggestedAction(overallRiskScore),
    riskBreakdown: riskBreakdown.length > 0
      ? riskBreakdown
      : [
          {
            key: "contract",
            label: "Token security",
            score: overallRiskScore,
            severity: riskLevel(overallRiskScore),
            finding: `${onchainResult.summary} ${newsResult.summary}`,
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
      ...newsResult.sources.map((source) => ({
        label: source.label,
        status: source.status,
        detail: source.detail ?? "",
      })),
    ],
    scannedAt: onchainResult.createdAt,
  };
}
