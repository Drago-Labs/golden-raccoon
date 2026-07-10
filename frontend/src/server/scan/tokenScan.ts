import type { AgentFinding, AgentResult, RiskBreakdownItem, RiskLevel, TokenScanResult } from "@/server/types";
import { runDecisionAgent } from "@/server/agents/decision";
import { runPortfolioAgent } from "@/server/agents/portfolio";
import { runAgentSafely, scoreToRiskLevel } from "@/server/agents/shared";
import { runNewsAgent } from "@/server/agents/news";
import { runOnchainAgent } from "@/server/agents/onchain";
import { runSocialAgent } from "@/server/agents/social";
import { buildRiskReport, createRiskReportInput } from "@/server/scan/riskReport";
import { normalizeTokenInput } from "@/server/scan/tokenInput";

function riskLevel(score: number): RiskLevel {
  return scoreToRiskLevel(score);
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

function suggestedActionFromDecision(decisionResult: AgentResult): TokenScanResult["suggestedAction"] {
  if (decisionResult.recommendedAction === "avoid" || decisionResult.recommendedAction === "manual_review" || decisionResult.recommendedAction === "watch") {
    return {
      type: "hold",
      fromToken: "TOKEN",
      toToken: "USDC",
      percent: 0,
    };
  }

  if (decisionResult.recommendedAction === "reduce_exposure") {
    return {
      type: "reduce_exposure",
      fromToken: "TOKEN",
      toToken: "USDC",
      percent: 30,
    };
  }

  if (decisionResult.recommendedAction === "swap_to_stable") {
    return {
      type: "swap_to_stablecoin",
      fromToken: "TOKEN",
      toToken: "USDC",
      percent: 30,
    };
  }

  return {
    type: "hold",
    fromToken: "TOKEN",
    toToken: "USDC",
    percent: 0,
  };
}

function verdictFromScore(score: number): TokenScanResult["verdict"] {
  if (score >= 75) return "critical";
  if (score >= 50) return "high_risk";
  if (score >= 25) return "watch";
  return "safe";
}

function getDataQuality(sources: TokenScanResult["sources"]): TokenScanResult["dataQuality"] {
  const connectedSources = sources.filter((source) => source.status === "connected").length;
  const unavailableSources = sources.filter((source) => source.status === "unavailable").length;
  const mockSources = sources.filter((source) => source.status === "mock").length;
  const mode = connectedSources === 0 ? "unavailable" : unavailableSources > 0 || mockSources > 0 ? "partial" : "live";

  return {
    mode,
    connectedSources,
    unavailableSources,
    mockSources,
    sourceCount: sources.length,
    reliability:
      sources.length > 0
        ? sources.reduce((total, source) => {
            if (source.status === "connected") return total + 0.75;
            if (source.status === "mock") return total + 0.35;
            return total + 0.1;
          }, 0) / sources.length
        : 0,
    detail:
      mode === "live"
        ? "All scan signals came from connected live sources."
        : mode === "partial"
          ? "Some scan signals were unavailable. The verdict is conservative."
          : "No live scan source could resolve this token. Manual review is required.",
  };
}

function buildUnresolvedTokenScan(query: string, chain?: string): TokenScanResult {
  const sources: TokenScanResult["sources"] = [
    {
      label: "Input normalization",
      status: "unavailable",
      detail: "Input could not be resolved as an EVM contract address or DexScreener pair/token URL.",
    },
  ];

  const scannedAt = new Date().toISOString();
  const dataQuality = getDataQuality(sources);
  const normalizedInput = createRiskReportInput(query, chain, null);

  return {
    symbol: query.trim().slice(0, 16).toUpperCase() || "UNKNOWN",
    tokenAddress: "",
    chain: chain || "unknown",
    normalizedInput,
    overallRiskScore: 72,
    opportunityScore: 0,
    verdict: "high_risk",
    summary: "Token scan could not resolve this input through live token sources. No mock risk score was generated.",
    reasons: [
      "Input was not a valid EVM contract address.",
      "Input was not a supported DexScreener token or pair URL.",
      "Manual review is required before any wallet action.",
    ],
    suggestedAction: {
      type: "hold",
      fromToken: "TOKEN",
      toToken: "USDC",
      percent: 0,
    },
    riskBreakdown: [
      {
        key: "contract",
        label: "Input unresolved",
        score: 72,
        severity: "high",
        finding: "No live contract, liquidity, news or social scan was run because the token input could not be resolved.",
      },
    ],
    sources,
    dataQuality,
    riskReport: {
      id: `risk_unresolved_${scannedAt.replace(/[^0-9]/g, "")}`,
      chain: normalizedInput.chain,
      symbol: query.trim().slice(0, 16).toUpperCase() || "UNKNOWN",
      buyRisk: 72,
      confidence: 0.18,
      verdict: "manual_review",
      summary: "Bu input desteklenen contract veya DexScreener linki olarak cozumlenemedi. Mock risk skoru uretilmedi; manuel inceleme gerekli.",
      topReasons: [
        "Input valid EVM contract address degil.",
        "Input desteklenen DexScreener token veya pair URL'i degil.",
        "Canli kaynak calismadigi icin alim guvenli kabul edilemez.",
      ],
      input: normalizedInput,
      agentCards: [],
      sources: [
        {
          label: "Input normalization",
          status: "unavailable",
          detail: "Input could not be resolved as an EVM contract address or DexScreener pair/token URL.",
        },
      ],
      missingData: [
        {
          field: "token identity",
          reason: "Contract address or DexScreener identity could not be resolved.",
          impact: "high",
          requiredFor: "risk report",
          canRetry: true,
          fallbackUsed: false,
        },
      ],
      createdAt: scannedAt,
    },
    scannedAt,
  };
}

export async function runTokenScan(query: string, chain?: string, walletAddress?: string): Promise<TokenScanResult> {
  const normalized = await normalizeTokenInput(query, chain);

  if (!normalized) {
    return buildUnresolvedTokenScan(query, chain);
  }

  const [onchainResult, newsResult, socialResult, portfolioResult] = await Promise.all([
    runAgentSafely("onchain", () =>
      runOnchainAgent({
        chain: normalized.chain,
        contractAddress: normalized.contractAddress,
      }),
    ),
    runAgentSafely("news", () =>
      runNewsAgent({
        symbol: normalized.symbol,
        tokenName: normalized.name,
        contractAddress: normalized.contractAddress,
      }),
    ),
    runAgentSafely("social", () =>
      runSocialAgent({
        symbol: normalized.symbol,
        tokenName: normalized.name,
        query: normalized.symbol ?? normalized.name ?? normalized.contractAddress,
        websiteUrl: normalized.links?.websiteUrl,
        twitterUrl: normalized.links?.twitterUrl,
        telegramUrl: normalized.links?.telegramUrl,
      }),
    ),
    runAgentSafely("portfolio", () =>
      runPortfolioAgent(walletAddress, {
        contractAddress: normalized.contractAddress,
        symbol: normalized.symbol,
      }),
    ),
  ]);
  const specialistResults = walletAddress ? [onchainResult, newsResult, socialResult, portfolioResult] : [onchainResult, newsResult, socialResult];
  const targetExposure = typeof portfolioResult.rawSignals?.targetTokenExposurePercent === "number" ? portfolioResult.rawSignals.targetTokenExposurePercent : 0;
  const stableReserve = portfolioResult.rawSignals?.portfolioRisk as { stableReservePercent?: unknown } | undefined;
  const decisionResult = runDecisionAgent({
    results: specialistResults,
    context: {
      mode: "token_scan",
      walletAddress,
      tokenSymbol: normalized.symbol,
      userAlreadyOwnsToken: Boolean(walletAddress && targetExposure > 0),
      holdingAllocationPercent: targetExposure,
      stableReservePercent: typeof stableReserve?.stableReservePercent === "number" ? stableReserve.stableReservePercent : undefined,
    },
  });
  const overallRiskScore = decisionResult.score;
  const combinedFindings = [...decisionResult.findings, ...onchainResult.findings, ...newsResult.findings, ...socialResult.findings, ...portfolioResult.findings];
  const riskBreakdown = combinedFindings.map(mapFindingToBreakdown);

  const sources: TokenScanResult["sources"] = [
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
    ...portfolioResult.sources.map((source) => ({
      label: source.label,
      status: source.status,
      detail: source.detail ?? "",
    })),
    ...decisionResult.sources.map((source) => ({
      label: source.label,
      status: source.status,
      detail: source.detail ?? "",
    })),
  ];
  const dataQuality = getDataQuality(sources);
  const scannedAt = onchainResult.createdAt;
  const riskReport = buildRiskReport({
    query,
    requestedChain: chain,
    normalized,
    results: [onchainResult, newsResult, socialResult, portfolioResult, decisionResult],
    decision: decisionResult,
    dataQuality,
    createdAt: scannedAt,
  });

  return {
    symbol: normalized.symbol ?? "TOKEN",
    tokenAddress: normalized.contractAddress,
    chain: normalized.chain,
    normalizedInput: riskReport.input,
    market: normalized.market,
    overallRiskScore,
    opportunityScore: Math.max(0, 100 - overallRiskScore),
    verdict: verdictFromScore(overallRiskScore),
    summary: `${decisionResult.summary} ${onchainResult.summary} ${newsResult.summary} ${socialResult.summary} ${portfolioResult.summary}`,
    reasons: combinedFindings.map((finding) => finding.detail).slice(0, 10),
    suggestedAction: suggestedActionFromDecision(decisionResult),
    riskBreakdown: riskBreakdown.length > 0
      ? riskBreakdown
      : [
          {
            key: "contract",
            label: "Token security",
            score: overallRiskScore,
            severity: riskLevel(overallRiskScore),
            finding: `${decisionResult.summary} ${onchainResult.summary} ${newsResult.summary} ${socialResult.summary}`,
          },
    ],
    sources,
    dataQuality,
    riskReport,
    scannedAt,
  };
}
