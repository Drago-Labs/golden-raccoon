import { z } from "zod";
import type {
  AgentFinding,
  AgentResult,
  AgentScoreCard,
  AgentSource,
  RiskLevel,
  RiskReport,
  RiskReportInput,
  RiskReportVerdict,
  ScoreFactor,
  ScoreFactorCategory,
  SourceDataQuality,
} from "@/server/types";
import type { NormalizedTokenInput } from "@/server/scan/tokenInput";

const severityWeight: Record<RiskLevel, number> = {
  low: 12,
  medium: 36,
  high: 68,
  critical: 92,
};

const agentDisplayNames: Record<AgentResult["agent"], string> = {
  portfolio: "Portfolio Keeper",
  onchain: "Contract Guard",
  news: "News Oracle",
  social: "Social Scout",
  decision: "Decision Core",
  execution: "Execution Pilot",
};

export const riskReportConventions = {
  verdicts: {
    buy_small: "Buy small",
    watch: "Watch",
    avoid: "Avoid",
    hold: "Hold",
    reduce_exposure: "Reduce exposure",
    manual_review: "Manual review",
  } satisfies Record<RiskReportVerdict, string>,
  riskBands: [
    { min: 0, max: 24, label: "Low risk" },
    { min: 25, max: 49, label: "Watch risk" },
    { min: 50, max: 74, label: "High risk" },
    { min: 75, max: 100, label: "Critical risk" },
  ],
  uiTone: "Minimal, lightly game-like, and decision-first.",
};

const scoreFactorSchema = z.object({
  label: z.string(),
  category: z.string(),
  impact: z.number(),
  weight: z.number().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  detail: z.string(),
  sourceLabel: z.string().optional(),
  direction: z.enum(["risk_increase", "risk_decrease", "neutral"]),
  raw: z.unknown().optional(),
  meta: z.record(z.union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()])).optional(),
});

export const riskReportSchema = z.object({
  id: z.string(),
  chain: z.string(),
  contractAddress: z.string().optional(),
  symbol: z.string(),
  tokenName: z.string().optional(),
  buyRisk: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  verdict: z.enum(["buy_small", "watch", "avoid", "hold", "reduce_exposure", "manual_review"]),
  summary: z.string(),
  topReasons: z.array(z.string()),
  input: z.object({
    query: z.string(),
    chain: z.string(),
    contractAddress: z.string().optional(),
    pairAddress: z.string().optional(),
    pairUrl: z.string().optional(),
    symbol: z.string().optional(),
    tokenName: z.string().optional(),
    source: z.enum(["contract_address", "dexscreener_pair_url", "dexscreener_token_url", "unresolved"]),
  }),
  agentCards: z.array(
    z.object({
      agent: z.enum(["portfolio", "news", "social", "onchain", "decision", "execution"]),
      displayName: z.string(),
      score: z.number().min(0).max(100),
      scoreKind: z.enum(["risk", "trust", "signal", "exposure", "decision"]),
      confidence: z.number().min(0).max(1),
      status: z.string(),
      summary: z.string(),
      factors: z.array(scoreFactorSchema),
      criticalFactors: z.array(scoreFactorSchema).optional(),
      secondaryScores: z.array(
        z.object({
          label: z.string(),
          score: z.number().min(0).max(100),
          detail: z.string(),
        }),
      ).optional(),
      sources: z.array(z.unknown()),
      missingData: z.array(z.unknown()),
    }),
  ),
  sources: z.array(z.unknown()),
  missingData: z.array(z.unknown()),
  executionPreview: z.unknown().optional(),
  createdAt: z.string(),
});

export function validateRiskReport(report: RiskReport) {
  return riskReportSchema.safeParse(report);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getReportId(input: RiskReportInput, createdAt: string) {
  const basis = `${input.chain}:${input.contractAddress ?? input.pairAddress ?? input.query}:${createdAt}`;
  let hash = 5381;

  for (let index = 0; index < basis.length; index += 1) {
    hash = (hash * 33) ^ basis.charCodeAt(index);
  }

  return `risk_${(hash >>> 0).toString(16)}`;
}

export function createRiskReportInput(query: string, chain: string | undefined, normalized: NormalizedTokenInput | null): RiskReportInput {
  if (!normalized) {
    return {
      query,
      chain: chain || "unknown",
      source: "unresolved",
    };
  }

  return {
    query,
    chain: normalized.chain,
    contractAddress: normalized.contractAddress,
    pairAddress: normalized.pairAddress,
    pairUrl: normalized.market?.pairUrl,
    symbol: normalized.symbol,
    tokenName: normalized.name,
    source: normalized.source,
  };
}

function categoryForFinding(agent: AgentResult["agent"], finding: AgentFinding): ScoreFactorCategory {
  const text = `${finding.label} ${finding.detail}`.toLowerCase();

  if (agent === "onchain") {
    if (text.includes("honeypot") || text.includes("cannot sell") || text.includes("blacklist") || text.includes("sellability")) return "sellability";
    if (text.includes("tax")) return "taxes";
    if (text.includes("liquidity") || text.includes("fdv")) return "liquidity";
    if (text.includes("holder")) return "holder_concentration";
    if (text.includes("lp") || text.includes("lock") || text.includes("burn")) return "lp_lock";
    if (text.includes("volume") || text.includes("anomaly") || text.includes("wash") || text.includes("pair age")) return "market_anomaly";
    if (text.includes("creator") || text.includes("deployer") || text.includes("owner sell")) return "creator_behavior";
    if (text.includes("owner") || text.includes("mint") || text.includes("pause") || text.includes("proxy") || text.includes("permission")) return "owner_controls";
  }

  if (agent === "social") {
    if (text.includes("phishing") || text.includes("drainer") || text.includes("claim") || text.includes("airdrop")) return "phishing";
    if (text.includes("engagement") || text.includes("bot") || text.includes("shill") || text.includes("reply")) return "social_engagement";
    return "social_identity";
  }

  if (agent === "news") {
    if (text.includes("hack") || text.includes("exploit") || text.includes("regulatory") || text.includes("scam") || text.includes("negative")) return "news_risk";
    return "news_catalyst";
  }

  if (agent === "portfolio") return "portfolio_exposure";
  if (agent === "decision") return "decision_logic";

  return "source_coverage";
}

function factorDirection(finding: AgentFinding): ScoreFactor["direction"] {
  if (finding.severity === "low" && (finding.scoreImpact ?? 0) <= 12) {
    return "risk_decrease";
  }

  if ((finding.scoreImpact ?? 0) === 0 && finding.severity === "low") {
    return "neutral";
  }

  return "risk_increase";
}

function findingToFactor(agent: AgentResult["agent"], finding: AgentFinding): ScoreFactor {
  const direction = factorDirection(finding);
  const baseImpact = finding.scoreImpact ?? severityWeight[finding.severity];

  return {
    label: finding.label,
    category: categoryForFinding(agent, finding),
    impact: direction === "risk_decrease" ? -Math.abs(baseImpact) : Math.abs(baseImpact),
    weight: finding.weight,
    severity: finding.severity,
    detail: finding.detail,
    sourceLabel: finding.sourceLabel,
    direction,
    raw: finding.raw,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

function nestedRecord(source: Record<string, unknown> | undefined, key: string) {
  return asRecord(source?.[key]);
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function asBooleanFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true" || value === "yes";
}

function formatPercentValue(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}%` : "unknown";
}

function factorFromRaw(input: {
  label: string;
  category: ScoreFactorCategory;
  impact: number;
  severity?: RiskLevel;
  detail: string;
  sourceLabel?: string;
  direction?: ScoreFactor["direction"];
  meta?: ScoreFactor["meta"];
}): ScoreFactor {
  return {
    label: input.label,
    category: input.category,
    impact: input.impact,
    severity: input.severity ?? (input.impact >= 75 ? "critical" : input.impact >= 50 ? "high" : input.impact >= 25 ? "medium" : "low"),
    detail: input.detail,
    sourceLabel: input.sourceLabel,
    direction: input.direction ?? (input.impact > 0 ? "risk_increase" : input.impact < 0 ? "risk_decrease" : "neutral"),
    meta: input.meta,
  };
}

function getLiquidityImpact(liquidityUsd?: number) {
  if (typeof liquidityUsd !== "number") return 42;
  if (liquidityUsd < 10_000) return 86;
  if (liquidityUsd < 50_000) return 68;
  if (liquidityUsd < 250_000) return 38;
  return 10;
}

function buildOnchainRawFactors(result: AgentResult): ScoreFactor[] {
  const raw = result.rawSignals;
  const security = nestedRecord(raw, "security");
  const market = nestedRecord(raw, "market");
  const bestPair = nestedRecord(market, "bestPair");
  const holders = nestedRecord(raw, "holders");
  const lp = nestedRecord(raw, "lp");
  const lockProvider = nestedRecord(lp, "lockProvider");
  const scoreBreakdown = nestedRecord(raw, "scoreBreakdown");
  const factors: ScoreFactor[] = [];
  const hasSecurity = Boolean(security);
  const hasPair = Boolean(bestPair);
  const honeypot = asBooleanFlag(security?.honeypot);
  const cannotSell =
    asBooleanFlag(security?.cannotSell) ||
    result.findings.some((finding) => `${finding.label} ${finding.detail}`.toLowerCase().includes("cannot sell"));
  const blacklist = asBooleanFlag(security?.blacklist);
  const criticalFlags = [
    honeypot ? "honeypot" : undefined,
    cannotSell ? "cannot sell" : undefined,
    blacklist ? "blacklist" : undefined,
  ].filter(Boolean);

  if (criticalFlags.length > 0) {
    factors.push(
      factorFromRaw({
        label: "Critical sellability override",
        category: "sellability",
        impact: 96,
        severity: "critical",
        detail: `Critical blocker detected: ${criticalFlags.join(", ")}. This should appear before non-critical signals.`,
        sourceLabel: "GoPlus token security",
        meta: { honeypot, cannotSell, blacklist },
      }),
    );
  }

  if (hasSecurity) {
    const buyTax = asNumber(security?.buyTax);
    const sellTax = asNumber(security?.sellTax);
    const taxImpact = Math.max(buyTax ?? 0, sellTax ?? 0) >= 20 ? 72 : Math.max(buyTax ?? 0, sellTax ?? 0) >= 8 ? 38 : 8;

    factors.push(
      factorFromRaw({
        label: "Buy tax",
        category: "taxes",
        impact: buyTax === undefined ? 24 : buyTax >= 20 ? 72 : buyTax >= 8 ? 38 : 8,
        detail: `Buy tax is ${formatPercentValue(buyTax)}.`,
        sourceLabel: "GoPlus token security",
        meta: { buyTaxPercent: buyTax },
      }),
      factorFromRaw({
        label: "Sell tax",
        category: "taxes",
        impact: sellTax === undefined ? 24 : sellTax >= 20 ? 72 : sellTax >= 8 ? 38 : 8,
        detail: `Sell tax is ${formatPercentValue(sellTax)}.`,
        sourceLabel: "GoPlus token security",
        meta: { sellTaxPercent: sellTax, combinedTaxImpact: taxImpact },
      }),
    );
  }

  if (hasPair) {
    const liquidityUsd = asNumber(bestPair?.liquidityUsd);
    const fdvUsd = asNumber(bestPair?.fdvUsd);
    const pairAgeDays = asNumber(bestPair?.pairAgeDays);
    const fdvLiquidityRatio = liquidityUsd && liquidityUsd > 0 && fdvUsd ? fdvUsd / liquidityUsd : undefined;

    factors.push(
      factorFromRaw({
        label: "Liquidity USD",
        category: "liquidity",
        impact: getLiquidityImpact(liquidityUsd),
        detail: `DEX liquidity is ${typeof liquidityUsd === "number" ? `$${Math.round(liquidityUsd).toLocaleString("en-US")}` : "unknown"}.`,
        sourceLabel: "DexScreener token pairs",
        meta: { liquidityUsd },
      }),
      factorFromRaw({
        label: "Pair age",
        category: "market_anomaly",
        impact: pairAgeDays === undefined ? 28 : pairAgeDays < 2 ? 62 : pairAgeDays < 14 ? 34 : 8,
        detail: `Primary pair age is ${typeof pairAgeDays === "number" ? `${pairAgeDays} day${pairAgeDays === 1 ? "" : "s"}` : "unknown"}.`,
        sourceLabel: "DexScreener token pairs",
        meta: { pairAgeDays },
      }),
      factorFromRaw({
        label: "FDV/liquidity ratio",
        category: "liquidity",
        impact: fdvLiquidityRatio === undefined ? 34 : fdvLiquidityRatio >= 120 ? 76 : fdvLiquidityRatio >= 40 ? 48 : 12,
        detail: `FDV/liquidity ratio is ${typeof fdvLiquidityRatio === "number" ? `${fdvLiquidityRatio.toFixed(2)}x` : "unknown"}.`,
        sourceLabel: "DexScreener token pairs",
        meta: { fdvUsd, liquidityUsd, fdvLiquidityRatio },
      }),
    );
  } else {
    factors.push(
      factorFromRaw({
        label: "DexScreener unavailable",
        category: "source_coverage",
        impact: Math.max(52, asNumber(scoreBreakdown?.sourceQuality) ?? 52),
        severity: "high",
        detail: "DexScreener pair data is unavailable, so liquidity and market confidence are reduced.",
        sourceLabel: "DexScreener token pairs",
      }),
    );
  }

  factors.push(
    factorFromRaw({
      label: "Holder concentration",
      category: "holder_concentration",
      impact: asNumber(scoreBreakdown?.holderConcentration) ?? 42,
      detail: `Top holder ${formatPercentValue(asNumber(holders?.topHolderPercent))}; top 5 ${formatPercentValue(asNumber(holders?.top5Percent))}; top 10 ${formatPercentValue(asNumber(holders?.top10Percent))}.`,
      sourceLabel: "Holder distribution",
      meta: {
        topHolderPercent: asNumber(holders?.topHolderPercent),
        top5Percent: asNumber(holders?.top5Percent),
        top10Percent: asNumber(holders?.top10Percent),
        holderCount: asNumber(holders?.holderCount),
      },
    }),
  );

  if (lockProvider) {
    const protectedPercent = asNumber(lockProvider.protectedPercent);
    factors.push(
      factorFromRaw({
        label: "LP lock/burn status",
        category: "lp_lock",
        impact: protectedPercent === undefined ? 44 : protectedPercent >= 80 ? 8 : protectedPercent >= 40 ? 34 : 70,
        detail: `LP protection is ${formatPercentValue(protectedPercent)} locked or burned; provider status ${String(lockProvider.provider ?? "unknown")}.`,
        sourceLabel: "GoPlus token security",
        meta: {
          lockedPercent: asNumber(lockProvider.lockedPercent),
          burnedPercent: asNumber(lockProvider.burnedPercent),
          protectedPercent,
          provider: typeof lockProvider.provider === "string" ? lockProvider.provider : undefined,
          unlockDate: typeof lockProvider.unlockDate === "string" ? lockProvider.unlockDate : undefined,
        },
      }),
    );
  }

  if (!hasSecurity) {
    factors.push(
      factorFromRaw({
        label: "Security provider unavailable",
        category: "source_coverage",
        impact: 58,
        severity: "high",
        detail: "GoPlus security data is unavailable, so contract flags, taxes and holder details require manual review.",
        sourceLabel: "GoPlus token security",
      }),
    );
  }

  return factors;
}

function buildSocialRawFactors(result: AgentResult): ScoreFactor[] {
  const raw = result.rawSignals;
  const resolver = nestedRecord(raw, "mandatorySocialResolver");
  const engagement = nestedRecord(raw, "engagement");
  const botShill = nestedRecord(raw, "botShillSummary");
  const phishing = nestedRecord(raw, "phishingScanner");
  const account = nestedRecord(raw, "account");
  const limitations = nestedRecord(raw, "limitations");
  const providerDataAvailable = raw?.providerDataAvailable === true;
  const factors: ScoreFactor[] = [];
  const officialConfidence = asNumber(raw?.officialAccountConfidence) ?? 0;
  const mutualVerificationScore = asNumber(resolver?.mutualVerificationScore);
  const engagementRisk = asNumber(engagement?.riskScore);
  const botRisk = asNumber(botShill?.riskScore);
  const riskyLinks = Array.isArray(phishing?.riskyLinks) ? phishing.riskyLinks.length : undefined;
  const followerCount = asNumber(account?.followers);
  const createdAt = typeof account?.createdAt === "string" ? account.createdAt : undefined;

  factors.push(
    factorFromRaw({
      label: "Official account match",
      category: "social_identity",
      impact: officialConfidence >= 0.7 ? -18 : officialConfidence >= 0.4 ? 18 : 48,
      severity: officialConfidence >= 0.7 ? "low" : officialConfidence >= 0.4 ? "medium" : "high",
      detail: `Official account confidence is ${Math.round(officialConfidence * 100)}%.`,
      sourceLabel: "Social provider",
      direction: officialConfidence >= 0.7 ? "risk_decrease" : "risk_increase",
      meta: { officialAccountConfidence: officialConfidence },
    }),
    factorFromRaw({
      label: "Website/social mutual verification",
      category: "social_identity",
      impact: mutualVerificationScore === undefined ? 24 : mutualVerificationScore >= 70 ? -16 : mutualVerificationScore >= 35 ? 18 : 44,
      severity: mutualVerificationScore === undefined ? "medium" : mutualVerificationScore >= 70 ? "low" : mutualVerificationScore >= 35 ? "medium" : "high",
      detail: `Website/social mutual verification score is ${mutualVerificationScore === undefined ? "unknown" : `${Math.round(mutualVerificationScore)}%`}.`,
      sourceLabel: "Social resolver",
      direction: mutualVerificationScore !== undefined && mutualVerificationScore >= 70 ? "risk_decrease" : "risk_increase",
      meta: { mutualVerificationScore },
    }),
    factorFromRaw({
      label: "Engagement quality",
      category: "social_engagement",
      impact: engagementRisk ?? 36,
      detail: typeof engagement?.detail === "string" ? engagement.detail : "Live engagement quality metrics are unavailable.",
      sourceLabel: "Social provider",
      meta: {
        engagementRisk,
        engagementAvailable: engagement?.available === true,
      },
    }),
    factorFromRaw({
      label: "Bot/shill risk",
      category: "social_engagement",
      impact: botRisk ?? 36,
      detail:
        botRisk === undefined
          ? "Comments/replies unavailable, so fake bot score is not generated."
          : `Bot/shill risk is ${botRisk}/100 from repeated text, low-quality replies, hype posts and new reply accounts.`,
      sourceLabel: "Social provider",
      meta: {
        botRisk,
        hypePostCount: asNumber(botShill?.hypePostCount),
        lowQualityReplyCount: asNumber(botShill?.lowQualityReplyCount),
        repeatedTextGroups: asNumber(botShill?.repeatedTextGroups),
      },
    }),
    factorFromRaw({
      label: "Phishing/drainer links",
      category: "phishing",
      impact: riskyLinks && riskyLinks > 0 ? 88 : 8,
      severity: riskyLinks && riskyLinks > 0 ? "critical" : "low",
      detail: `${riskyLinks ?? 0} risky claim, airdrop, connect-wallet, shortened or drainer-like link${riskyLinks === 1 ? "" : "s"} found.`,
      sourceLabel: "Social provider",
      meta: { riskyLinks },
    }),
  );

  if (account) {
    factors.push(
      factorFromRaw({
        label: "Account age and followers",
        category: "social_identity",
        impact: createdAt && Date.parse(createdAt) > Date.now() - 30 * 86_400_000 ? 46 : followerCount !== undefined && followerCount < 250 ? 34 : 10,
        detail: `Account created ${createdAt ?? "unknown"}; followers ${followerCount === undefined ? "unknown" : followerCount.toLocaleString("en-US")}.`,
        sourceLabel: "Social provider",
        meta: { createdAt, followerCount, postCount: asNumber(account.postCount) },
      }),
    );
  }

  if (!providerDataAvailable) {
    factors.push(
      factorFromRaw({
        label: "Social metrics unavailable",
        category: "source_coverage",
        impact: 48,
        severity: "medium",
        detail: "Provider data is unavailable. Fake follower, engagement or bot scores are not generated.",
        sourceLabel: "Social provider",
        meta: {
          fakeMetricsGenerated: limitations?.fakeMetricsGenerated === true,
          botScoreStatus: typeof limitations?.botScoreStatus === "string" ? limitations.botScoreStatus : "unavailable",
        },
      }),
    );
  }

  return factors;
}

function buildNewsRawFactors(result: AgentResult): ScoreFactor[] {
  const raw = result.rawSignals;
  const matchedArticles = Array.isArray(raw?.matchedArticles) ? raw.matchedArticles : [];
  const positiveCatalysts = Array.isArray(raw?.positiveCatalysts) ? raw.positiveCatalysts : [];
  const negativeCatalysts = Array.isArray(raw?.negativeCatalysts) ? raw.negativeCatalysts : [];
  const sourceCredibility = Array.isArray(raw?.sourceCredibility) ? raw.sourceCredibility : [];
  const timeline = nestedRecord(raw, "eventTimeline");
  const sourceReliability = asNumber(raw?.sourceReliability);
  const identityConfidence = asNumber(raw?.identityMatchConfidence);
  const totalEvents = positiveCatalysts.length + negativeCatalysts.length;
  const positivePercent = totalEvents > 0 ? (positiveCatalysts.length / totalEvents) * 100 : 0;
  const negativePercent = totalEvents > 0 ? (negativeCatalysts.length / totalEvents) * 100 : 0;
  const criticalEvents = negativeCatalysts.filter((event) => asRecord(event)?.severity === "critical" || ["scam_or_rug", "regulatory"].includes(String(asRecord(event)?.type ?? "")));

  return [
    factorFromRaw({
      label: "Positive catalyst score",
      category: "news_catalyst",
      impact: positiveCatalysts.length > 0 ? -Math.min(18, positiveCatalysts.length * 6) : 8,
      severity: "low",
      detail: `${positiveCatalysts.length} positive catalyst${positiveCatalysts.length === 1 ? "" : "s"} found; positive share is ${positivePercent.toFixed(0)}% of classified events.`,
      sourceLabel: "News sources",
      direction: positiveCatalysts.length > 0 ? "risk_decrease" : "neutral",
      meta: { positiveCatalystCount: positiveCatalysts.length, positivePercent },
    }),
    factorFromRaw({
      label: "Negative news risk",
      category: "news_risk",
      impact: negativePercent >= 75 ? 78 : negativePercent >= 40 ? 52 : negativeCatalysts.length > 0 ? 30 : 8,
      severity: criticalEvents.length > 0 ? "critical" : negativePercent >= 75 ? "high" : negativeCatalysts.length > 0 ? "medium" : "low",
      detail: `${negativeCatalysts.length} negative/scam/regulatory event${negativeCatalysts.length === 1 ? "" : "s"} found; negative share is ${negativePercent.toFixed(0)}%.`,
      sourceLabel: "News sources",
      meta: { negativeCatalystCount: negativeCatalysts.length, negativePercent, criticalEventCount: criticalEvents.length },
    }),
    factorFromRaw({
      label: "Source reliability",
      category: "news_catalyst",
      impact: sourceReliability === undefined ? 34 : sourceReliability >= 0.8 ? -12 : sourceReliability >= 0.6 ? 22 : 55,
      severity: sourceReliability === undefined ? "medium" : sourceReliability >= 0.8 ? "low" : sourceReliability >= 0.6 ? "medium" : "high",
      detail: `Average matched-source reliability is ${sourceReliability === undefined ? "unknown" : `${Math.round(sourceReliability * 100)}%`}; ${sourceCredibility.length} credibility profile${sourceCredibility.length === 1 ? "" : "s"} evaluated.`,
      sourceLabel: "News source registry",
      direction: sourceReliability !== undefined && sourceReliability >= 0.8 ? "risk_decrease" : "risk_increase",
      meta: { sourceReliability, sourceProfileCount: sourceCredibility.length },
    }),
    factorFromRaw({
      label: "Identity match confidence",
      category: "news_catalyst",
      impact: identityConfidence === undefined ? 44 : identityConfidence >= 0.75 ? -14 : identityConfidence >= 0.45 ? 24 : 64,
      severity: identityConfidence === undefined ? "medium" : identityConfidence >= 0.75 ? "low" : identityConfidence >= 0.45 ? "medium" : "high",
      detail: `News identity match confidence is ${identityConfidence === undefined ? "unknown" : `${Math.round(identityConfidence * 100)}%`}. Symbol-only matches stay low confidence.`,
      sourceLabel: "News identity resolver",
      direction: identityConfidence !== undefined && identityConfidence >= 0.75 ? "risk_decrease" : "risk_increase",
      meta: { identityMatchConfidence: identityConfidence },
    }),
    factorFromRaw({
      label: "Matched article list",
      category: "news_catalyst",
      impact: matchedArticles.length > 0 ? 8 : 36,
      severity: matchedArticles.length > 0 ? "low" : "medium",
      detail:
        matchedArticles.length > 0
          ? `${matchedArticles.length} deduped recent article${matchedArticles.length === 1 ? "" : "s"} matched the token identity.`
          : "No matching news article was found; this lowers confidence but is not a critical risk by itself.",
      sourceLabel: "News sources",
      meta: {
        matchedArticleCount: matchedArticles.length,
        independentSourceCount: asNumber(timeline?.independentSourceCount),
        lastSeen: typeof timeline?.lastSeen === "string" ? timeline.lastSeen : undefined,
      },
    }),
    factorFromRaw({
      label: "Critical news warning",
      category: "news_risk",
      impact: criticalEvents.length > 0 ? 92 : 0,
      severity: criticalEvents.length > 0 ? "critical" : "low",
      detail:
        criticalEvents.length > 0
          ? `${criticalEvents.length} critical news event${criticalEvents.length === 1 ? "" : "s"} detected: hack, exploit, scam, rug, phishing, regulatory or security warning context.`
          : "No critical hack, exploit, scam, rug, phishing, regulatory or security warning event was found.",
      sourceLabel: "News classifier",
      direction: criticalEvents.length > 0 ? "risk_increase" : "neutral",
      meta: { criticalEventCount: criticalEvents.length },
    }),
  ];
}

function buildPortfolioRawFactors(result: AgentResult): ScoreFactor[] {
  const raw = result.rawSignals;
  const portfolioRisk = nestedRecord(raw, "portfolioRisk");
  const targetExposure = asNumber(raw?.targetTokenExposurePercent);
  const emptyState = typeof raw?.emptyState === "string" ? raw.emptyState : undefined;

  if (emptyState) {
    return [
      factorFromRaw({
        label: emptyState === "wallet_not_connected" ? "Wallet not connected" : "Portfolio unavailable",
        category: "source_coverage",
        impact: emptyState === "wallet_not_connected" ? 24 : 58,
        severity: emptyState === "wallet_not_connected" ? "medium" : "high",
        detail:
          emptyState === "wallet_not_connected"
            ? "No wallet address was supplied. Portfolio exposure is visible as not connected and is not weighted into the token decision."
            : "Portfolio provider did not return usable holdings. No mock portfolio was generated.",
        sourceLabel: "Portfolio source",
        meta: { emptyState },
      }),
    ];
  }

  return [
    factorFromRaw({
      label: "Target token exposure",
      category: "portfolio_exposure",
      impact: targetExposure === undefined ? 18 : targetExposure >= 40 ? 72 : targetExposure >= 15 ? 42 : 8,
      severity: targetExposure === undefined ? "medium" : targetExposure >= 40 ? "high" : targetExposure >= 15 ? "medium" : "low",
      detail: `Target token exposure is ${formatPercentValue(targetExposure)} of the connected wallet.`,
      sourceLabel: "Wallet portfolio API",
      meta: { targetTokenExposurePercent: targetExposure },
    }),
    factorFromRaw({
      label: "Largest/top holdings",
      category: "portfolio_exposure",
      impact: asNumber(portfolioRisk?.concentrationRisk) ?? 42,
      detail: `Largest holding ${formatPercentValue(asNumber(portfolioRisk?.largestHoldingPercent))}; top 3 ${formatPercentValue(asNumber(portfolioRisk?.top3HoldingPercent))}.`,
      sourceLabel: "Wallet portfolio API",
      meta: {
        largestHoldingPercent: asNumber(portfolioRisk?.largestHoldingPercent),
        top3HoldingPercent: asNumber(portfolioRisk?.top3HoldingPercent),
      },
    }),
    factorFromRaw({
      label: "Stable reserve",
      category: "portfolio_exposure",
      impact: asNumber(portfolioRisk?.stableReserveRisk) ?? 42,
      detail: `Verified stable reserve is ${formatPercentValue(asNumber(portfolioRisk?.stableReservePercent))}.`,
      sourceLabel: "Wallet portfolio API",
      meta: { stableReservePercent: asNumber(portfolioRisk?.stableReservePercent) },
    }),
    factorFromRaw({
      label: "Low-liquidity exposure",
      category: "portfolio_exposure",
      impact: asNumber(portfolioRisk?.liquidityExitRisk) ?? 42,
      detail: `${formatPercentValue(asNumber(portfolioRisk?.lowLiquidityExposurePercent))} of the wallet carries elevated liquidity exit risk.`,
      sourceLabel: "Wallet portfolio API",
      meta: { lowLiquidityExposurePercent: asNumber(portfolioRisk?.lowLiquidityExposurePercent) },
    }),
    factorFromRaw({
      label: "Unknown price exposure",
      category: "portfolio_exposure",
      impact: asNumber(portfolioRisk?.assetQualityRisk) ?? 42,
      detail: `${formatPercentValue(asNumber(portfolioRisk?.unknownPriceExposurePercent))} of wallet value has unknown/no-price exposure.`,
      sourceLabel: "Wallet portfolio API",
      meta: {
        unknownPriceExposurePercent: asNumber(portfolioRisk?.unknownPriceExposurePercent),
        unverifiedExposurePercent: asNumber(portfolioRisk?.unverifiedExposurePercent),
      },
    }),
    factorFromRaw({
      label: "Native gas readiness",
      category: "portfolio_exposure",
      impact: asNumber(portfolioRisk?.chainExecutionRisk) ?? 42,
      detail: portfolioRisk?.hasNativeGasToken === true ? "Native gas token was detected for execution readiness." : "Native gas token was not detected; exits may require funding gas first.",
      sourceLabel: "Wallet portfolio API",
      meta: {
        hasNativeGasToken: portfolioRisk?.hasNativeGasToken === true,
        dominantChainPercent: asNumber(portfolioRisk?.dominantChainPercent),
      },
    }),
  ];
}

function buildDecisionRawFactors(result: AgentResult): ScoreFactor[] {
  const raw = result.rawSignals;
  const confidenceFormula = nestedRecord(raw, "confidenceFormula");
  const sourceCoverage = nestedRecord(raw, "sourceCoverage");
  const explanation = nestedRecord(raw, "explanation");
  const blockers = Array.isArray(raw?.blockers) ? raw.blockers : [];
  const conflicts = Array.isArray(raw?.conflicts) ? raw.conflicts : [];
  const weightedScore = nestedRecord(raw, "weightedScore");
  const details = Array.isArray(weightedScore?.details) ? weightedScore.details : [];
  const whatWouldChange = Array.isArray(explanation?.whatWouldChangeDecision) ? explanation.whatWouldChangeDecision : [];

  return [
    factorFromRaw({
      label: "Final buy risk formula",
      category: "decision_logic",
      impact: result.riskScore,
      severity: result.riskLevel,
      detail: `Final buy risk is ${result.riskScore}/100 from weighted specialist agents.`,
      sourceLabel: "Decision Core",
      meta: { weightedAgentCount: details.length },
    }),
    factorFromRaw({
      label: "Critical blocker matrix",
      category: "decision_logic",
      impact: blockers.length > 0 ? 92 : 0,
      severity: blockers.some((blocker) => asRecord(blocker)?.severity === "critical") ? "critical" : blockers.length > 0 ? "high" : "low",
      detail: blockers.length > 0 ? `${blockers.length} deterministic blocker${blockers.length === 1 ? "" : "s"} affected the decision.` : "No deterministic critical blocker affected the decision.",
      sourceLabel: "Decision Core",
      direction: blockers.length > 0 ? "risk_increase" : "neutral",
      meta: { blockerCount: blockers.length, conflictCount: conflicts.length },
    }),
    factorFromRaw({
      label: "What would change this decision",
      category: "decision_logic",
      impact: 0,
      severity: "low",
      detail: whatWouldChange.length > 0 ? whatWouldChange.slice(0, 3).join(" ") : "No change conditions were produced.",
      sourceLabel: "Decision Core",
      direction: "neutral",
      meta: { itemCount: whatWouldChange.length },
    }),
    factorFromRaw({
      label: "Decision confidence breakdown",
      category: "decision_logic",
      impact: clampScore((1 - result.confidence) * 100),
      severity: result.confidence >= 0.65 ? "low" : result.confidence >= 0.42 ? "medium" : "high",
      detail: `Confidence uses agent confidence, source coverage, identity confidence, provider freshness, agreement and conflict penalty.`,
      sourceLabel: "Decision Core",
      meta: {
        agentConfidence: asNumber(confidenceFormula?.agentConfidence),
        sourceCoverage: asNumber(confidenceFormula?.sourceCoverage),
        identityConfidence: asNumber(confidenceFormula?.identityConfidence),
        providerFreshness: asNumber(confidenceFormula?.providerFreshness),
        crossAgentAgreement: asNumber(confidenceFormula?.crossAgentAgreement),
        conflictPenalty: asNumber(confidenceFormula?.conflictPenalty),
      },
    }),
    factorFromRaw({
      label: "Source coverage",
      category: "source_coverage",
      impact: asNumber(sourceCoverage?.connected) === 0 ? 72 : asNumber(sourceCoverage?.ratio) !== undefined && (asNumber(sourceCoverage?.ratio) ?? 0) < 0.5 ? 42 : 8,
      severity: asNumber(sourceCoverage?.connected) === 0 ? "high" : asNumber(sourceCoverage?.ratio) !== undefined && (asNumber(sourceCoverage?.ratio) ?? 0) < 0.5 ? "medium" : "low",
      detail: `${asNumber(sourceCoverage?.connected) ?? 0} connected and ${asNumber(sourceCoverage?.unavailable) ?? 0} unavailable sources contributed to the final decision.`,
      sourceLabel: "Decision Core",
      meta: {
        connected: asNumber(sourceCoverage?.connected),
        unavailable: asNumber(sourceCoverage?.unavailable),
        ratio: asNumber(sourceCoverage?.ratio),
      },
    }),
  ];
}

function buildRawFactors(result: AgentResult): ScoreFactor[] {
  if (result.agent === "onchain") return buildOnchainRawFactors(result);
  if (result.agent === "social") return buildSocialRawFactors(result);
  if (result.agent === "news") return buildNewsRawFactors(result);
  if (result.agent === "portfolio") return buildPortfolioRawFactors(result);
  if (result.agent === "decision") return buildDecisionRawFactors(result);

  return [];
}

function getSecondaryScores(result: AgentResult): AgentScoreCard["secondaryScores"] {
  if (result.agent === "social") {
    const raw = result.rawSignals;
    const officialConfidence = asNumber(raw?.officialAccountConfidence) ?? 0;
    const sourceCoverage = nestedRecord(raw, "sourceCoverage");
    const coverageRisk = asNumber(sourceCoverage?.riskScore) ?? (raw?.providerDataAvailable === true ? 24 : 56);
    const botShill = nestedRecord(raw, "botShillSummary");
    const botRisk = asNumber(botShill?.riskScore) ?? (raw?.providerDataAvailable === true ? 34 : 0);
    const phishing = nestedRecord(raw, "phishingScanner");
    const riskyLinks = Array.isArray(phishing?.riskyLinks) ? phishing.riskyLinks.length : 0;
    const trustScore = clampScore(officialConfidence * 70 + (100 - coverageRisk) * 0.3);
    const hypeRisk = raw?.providerDataAvailable === true ? clampScore(botRisk + riskyLinks * 16) : 0;

    return [
      {
        label: "Social Trust",
        score: trustScore,
        detail: "Official account match, mutual verification and source coverage.",
      },
      {
        label: "Hype Risk",
        score: hypeRisk,
        detail: raw?.providerDataAvailable === true ? "Bot/shill density, hype language and phishing links." : "Unavailable until a social provider returns live engagement data.",
      },
    ];
  }

  if (result.agent === "onchain") {
    const scoreBreakdown = nestedRecord(result.rawSignals, "scoreBreakdown");

    if (!scoreBreakdown) return undefined;

    return [
      {
        label: "Contract Risk",
        score: clampScore(asNumber(scoreBreakdown.contractSecurity) ?? result.riskScore),
        detail: "Critical flags, permissions, taxes and sellability.",
      },
      {
        label: "Liquidity Risk",
        score: clampScore(asNumber(scoreBreakdown.liquidityExit) ?? result.riskScore),
        detail: "DEX liquidity, LP lock/burn and exit readiness.",
      },
      {
        label: "Holder Risk",
        score: clampScore(asNumber(scoreBreakdown.holderConcentration) ?? result.riskScore),
        detail: "Top holder, top 5 and top 10 concentration.",
      },
    ];
  }

  if (result.agent === "news") {
    const raw = result.rawSignals;
    const positiveCatalysts = Array.isArray(raw?.positiveCatalysts) ? raw.positiveCatalysts : [];
    const negativeCatalysts = Array.isArray(raw?.negativeCatalysts) ? raw.negativeCatalysts : [];
    const totalEvents = positiveCatalysts.length + negativeCatalysts.length;
    const positivePercent = totalEvents > 0 ? (positiveCatalysts.length / totalEvents) * 100 : 0;
    const negativePercent = totalEvents > 0 ? (negativeCatalysts.length / totalEvents) * 100 : 0;

    return [
      {
        label: "News Signal",
        score: clampScore(100 - result.riskScore),
        detail: "Positive catalysts, negative incidents, identity confidence and source reliability.",
      },
      {
        label: "Positive Catalyst",
        score: clampScore(positivePercent),
        detail: `${positiveCatalysts.length} positive catalyst${positiveCatalysts.length === 1 ? "" : "s"} matched.`,
      },
      {
        label: "News Risk",
        score: clampScore(negativePercent || result.riskScore),
        detail: `${negativeCatalysts.length} negative/scam/regulatory event${negativeCatalysts.length === 1 ? "" : "s"} matched.`,
      },
    ];
  }

  if (result.agent === "portfolio") {
    const portfolioRisk = nestedRecord(result.rawSignals, "portfolioRisk");
    const targetExposure = asNumber(result.rawSignals?.targetTokenExposurePercent);

    return [
      {
        label: "Token Exposure",
        score: clampScore(targetExposure ?? 0),
        detail: "Target token allocation inside the connected wallet.",
      },
      {
        label: "Stable Reserve",
        score: clampScore(asNumber(portfolioRisk?.stableReservePercent) ?? 0),
        detail: "Verified stablecoin reserve available for defensive flexibility.",
      },
      {
        label: "Exit Risk",
        score: clampScore(asNumber(portfolioRisk?.liquidityExitRisk) ?? result.riskScore),
        detail: "Low-liquidity exposure and allocation-weighted exit fragility.",
      },
    ];
  }

  if (result.agent === "decision") {
    const sourceCoverage = nestedRecord(result.rawSignals, "sourceCoverage");

    return [
      {
        label: "Final Buy Risk",
        score: clampScore(result.riskScore),
        detail: "Weighted deterministic decision from specialist agents.",
      },
      {
        label: "Decision Confidence",
        score: clampScore(result.confidence * 100),
        detail: "Agent confidence, source coverage, identity, freshness and agreement.",
      },
      {
        label: "Source Coverage",
        score: clampScore((asNumber(sourceCoverage?.ratio) ?? 0) * 100),
        detail: "Connected source share in the final decision.",
      },
    ];
  }

  return undefined;
}

function getScoreKind(agent: AgentResult["agent"]): AgentScoreCard["scoreKind"] {
  if (agent === "portfolio") return "exposure";
  if (agent === "news") return "signal";
  if (agent === "social") return "trust";
  if (agent === "decision") return "decision";

  return "risk";
}

function resultToCard(result: AgentResult): AgentScoreCard {
  const rawFactors = buildRawFactors(result);
  const factors = [...rawFactors, ...result.findings.map((finding) => findingToFactor(result.agent, finding))]
    .sort((left, right) => {
      const severityGap = severityWeight[right.severity] - severityWeight[left.severity];

      return severityGap !== 0 ? severityGap : Math.abs(right.impact) - Math.abs(left.impact);
    });
  const criticalFactors = factors.filter((factor) => factor.severity === "critical" || factor.category === "sellability").slice(0, 4);

  return {
    agent: result.agent,
    displayName: agentDisplayNames[result.agent],
    score: clampScore(result.riskScore),
    scoreKind: getScoreKind(result.agent),
    confidence: result.confidence,
    status: result.status,
    summary: result.summary,
    factors,
    criticalFactors: criticalFactors.length > 0 ? criticalFactors : undefined,
    secondaryScores: getSecondaryScores(result),
    sources: result.sources,
    missingData: result.missingData,
  };
}

function verdictFromDecision(decision: AgentResult): RiskReportVerdict {
  if (decision.confidence < 0.42) return "manual_review";
  if (decision.recommendedAction === "avoid") return "avoid";
  if (decision.recommendedAction === "reduce_exposure") return "reduce_exposure";
  if (decision.recommendedAction === "swap_to_stable") return "reduce_exposure";
  if (decision.recommendedAction === "hold") return "hold";
  if (decision.recommendedAction === "manual_review") return "manual_review";

  if (decision.riskScore <= 24 && decision.confidence >= 0.62) {
    return "buy_small";
  }

  return "watch";
}

function getTopReasons(results: AgentResult[], decision: AgentResult) {
  const critical = results
    .flatMap((result) => result.findings.map((finding) => ({ result, finding })))
    .filter(({ finding }) => finding.severity === "critical" || finding.severity === "high")
    .sort((left, right) => severityWeight[right.finding.severity] - severityWeight[left.finding.severity])
    .map(({ result, finding }) => `${agentDisplayNames[result.agent]}: ${finding.detail}`);
  const decisionReasons = decision.findings.map((finding) => `${agentDisplayNames.decision}: ${finding.detail}`);

  return [...critical, ...decisionReasons].slice(0, 5);
}

function getMissingData(results: AgentResult[]) {
  return results.flatMap((result) =>
    result.missingData.map((item) => ({
      ...item,
      field: `${agentDisplayNames[result.agent]}: ${item.field}`,
    })),
  );
}

function getSources(results: AgentResult[]): AgentSource[] {
  return results.flatMap((result) =>
    result.sources.map((source) => ({
      ...source,
      label: `${agentDisplayNames[result.agent]} - ${source.label}`,
    })),
  );
}

function conservativeSummary(report: {
  symbol: string;
  buyRisk: number;
  confidence: number;
  decisionSummary: string;
  topReasons: string[];
}) {
  const riskText = report.buyRisk >= 75 ? "kritik" : report.buyRisk >= 50 ? "yuksek" : report.buyRisk >= 25 ? "izlenebilir" : "dusuk";
  const confidenceText = Math.round(report.confidence * 100);
  const mainReason = report.topReasons[0] ? ` Ana sebep: ${report.topReasons[0]}` : "";

  return `${report.symbol} icin alim riski ${riskText} (%${report.buyRisk}). Confidence %${confidenceText}. ${report.decisionSummary}${mainReason}`;
}

export function buildRiskReport(input: {
  query: string;
  requestedChain?: string;
  normalized: NormalizedTokenInput | null;
  results: AgentResult[];
  decision: AgentResult;
  dataQuality?: SourceDataQuality;
  createdAt?: string;
}): RiskReport {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const reportInput = createRiskReportInput(input.query, input.requestedChain, input.normalized);
  const symbol = input.normalized?.symbol ?? (input.query.trim().slice(0, 16).toUpperCase() || "UNKNOWN");
  const buyRisk = clampScore(input.decision.riskScore);
  const confidence = input.dataQuality?.connectedSources === 0 ? Math.min(input.decision.confidence, 0.32) : input.decision.confidence;
  const topReasons = getTopReasons(input.results, input.decision);
  const report: RiskReport = {
    id: getReportId(reportInput, createdAt),
    chain: reportInput.chain,
    contractAddress: reportInput.contractAddress,
    symbol,
    tokenName: input.normalized?.name,
    buyRisk,
    confidence,
    verdict: confidence < 0.42 ? "manual_review" : verdictFromDecision(input.decision),
    summary: conservativeSummary({
      symbol,
      buyRisk,
      confidence,
      decisionSummary: input.decision.summary,
      topReasons,
    }),
    topReasons,
    input: reportInput,
    agentCards: input.results.map(resultToCard),
    sources: getSources(input.results),
    missingData: getMissingData(input.results),
    createdAt,
  };
  const parsed = validateRiskReport(report);

  if (!parsed.success) {
    throw new Error(`Invalid RiskReport generated: ${parsed.error.message}`);
  }

  return report;
}
