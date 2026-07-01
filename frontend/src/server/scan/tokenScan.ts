import type { AgentFinding, AgentResult, RiskBreakdownItem, RiskLevel, TokenScanResult } from "@/server/types";
import { runNewsAgent } from "@/server/agents/news";
import { runOnchainAgent } from "@/server/agents/onchain";
import { runSocialAgent } from "@/server/agents/social";
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
      : lowerLabel.includes("social") || lowerLabel.includes("phishing") || lowerLabel.includes("giveaway") || lowerLabel.includes("engagement")
        ? "xSentiment"
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

function hasConnectedSource(result: AgentResult) {
  return result.sources.some((source) => source.status === "connected");
}

function combineAgentScores(onchainResult: AgentResult, newsResult: AgentResult, socialResult: AgentResult) {
  const newsHasConnectedSource = newsResult.sources.some((source) => source.status === "connected");
  const socialHasConnectedSource = hasConnectedSource(socialResult);
  const newsWeight = newsHasConnectedSource ? 0.2 : 0.08;
  const socialWeight = socialHasConnectedSource ? 0.18 : 0.08;
  const onchainWeight = 1 - newsWeight - socialWeight;

  return Math.round(onchainResult.score * onchainWeight + newsResult.score * newsWeight + socialResult.score * socialWeight);
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

  const [onchainResult, newsResult, socialResult] = await Promise.all([
    runOnchainAgent({
      chain: normalized.chain,
      contractAddress: normalized.contractAddress,
    }),
    runNewsAgent({
      symbol: normalized.symbol,
      tokenName: normalized.name,
      contractAddress: normalized.contractAddress,
    }),
    runSocialAgent({
      symbol: normalized.symbol,
      tokenName: normalized.name,
      query: normalized.symbol ?? normalized.name ?? normalized.contractAddress,
      websiteUrl: normalized.links?.websiteUrl,
      twitterUrl: normalized.links?.twitterUrl,
      telegramUrl: normalized.links?.telegramUrl,
    }),
  ]);
  const overallRiskScore = combineAgentScores(onchainResult, newsResult, socialResult);
  const combinedFindings = [...onchainResult.findings, ...newsResult.findings, ...socialResult.findings];
  const riskBreakdown = combinedFindings.map(mapFindingToBreakdown);

  return {
    symbol: normalized.symbol ?? "TOKEN",
    tokenAddress: normalized.contractAddress,
    chain: normalized.chain,
    market: normalized.market,
    overallRiskScore,
    opportunityScore: Math.max(0, 100 - overallRiskScore),
    verdict: verdictFromScore(overallRiskScore),
    summary: `${onchainResult.summary} ${newsResult.summary} ${socialResult.summary}`,
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
            finding: `${onchainResult.summary} ${newsResult.summary} ${socialResult.summary}`,
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
      ...socialResult.sources.map((source) => ({
        label: source.label,
        status: source.status,
        detail: source.detail ?? "",
      })),
    ],
    scannedAt: onchainResult.createdAt,
  };
}
