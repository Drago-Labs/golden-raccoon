import type { AgentBlockingReason, AgentFinding, AgentMissingData, AgentRecommendedAction, AgentResult, AgentSource, RiskLevel, SourceDataQuality } from "@/server/types";
import { validateAgentResult } from "@/server/agents/schema";
import { assertNoMockSourcesInLive } from "@/server/env/runtimeMode";

type BuildAgentResultInput = {
  agent: AgentResult["agent"];
  score: number;
  verdict: string;
  summary: string;
  findings: AgentFinding[];
  sources?: AgentResult["sources"];
  confidence?: number;
  recommendedAction: AgentRecommendedAction;
  blockingReasons?: string[];
  blockingReasonDetails?: AgentBlockingReason[];
  missingData?: AgentMissingData[];
  rawSignals?: Record<string, unknown>;
};

export const riskLevelThresholds = {
  low: { min: 0, max: 24 },
  medium: { min: 25, max: 49 },
  high: { min: 50, max: 74 },
  critical: { min: 75, max: 100 },
} as const;

const severityScore: Record<RiskLevel, number> = {
  low: 12,
  medium: 38,
  high: 65,
  critical: 92,
};

export function clampScore(score: number) {
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function scoreToRiskLevel(score: number): RiskLevel {
  const boundedScore = clampScore(score);

  if (boundedScore >= riskLevelThresholds.critical.min) return "critical";
  if (boundedScore >= riskLevelThresholds.high.min) return "high";
  if (boundedScore >= riskLevelThresholds.medium.min) return "medium";

  return "low";
}

export function weightedScore(items: { score: number; weight: number }[]) {
  const weighted = items.reduce(
    (total, item) => ({
      score: total.score + clampScore(item.score) * item.weight,
      weight: total.weight + item.weight,
    }),
    { score: 0, weight: 0 },
  );

  return weighted.weight > 0 ? clampScore(weighted.score / weighted.weight) : 0;
}

export function applyCriticalOverride(score: number, findings: AgentFinding[]) {
  if (!findings.some((finding) => finding.severity === "critical")) {
    return clampScore(score);
  }

  return Math.max(clampScore(score), riskLevelThresholds.critical.min);
}

function normalizeFindings(findings: AgentFinding[], sourceLabel: string) {
  return findings.map((finding) => ({
    ...finding,
    scoreImpact: finding.scoreImpact ?? severityScore[finding.severity],
    weight: finding.weight ?? 1,
    sourceLabel: finding.sourceLabel ?? sourceLabel,
    interpretation: finding.interpretation ?? finding.detail,
    confidence: finding.confidence ?? 0.62,
  }));
}

export function getSourceDataQuality(sources: AgentSource[]): SourceDataQuality {
  const connectedSources = sources.filter((source) => source.status === "connected").length;
  const unavailableSources = sources.filter((source) => source.status === "unavailable").length;
  const mockSources = sources.filter((source) => source.status === "mock").length;
  const sourceCount = sources.length;
  const checkedTimes = sources
    .map((source) => source.checkedAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  const reliability =
    sourceCount > 0
      ? sources.reduce((total, source) => {
          if (typeof source.reliability === "number") return total + source.reliability;
          if (source.status === "connected") return total + 0.8;
          if (source.status === "mock") return total + 0.35;
          return total + 0.1;
        }, 0) / sourceCount
      : 0;
  const latencies = sources.map((source) => source.latencyMs).filter((value): value is number => typeof value === "number");
  const providerErrors = sources
    .filter((source) => source.error || source.errorCode)
    .map((source) => ({
      label: source.label,
      code: source.errorCode,
      detail: source.error,
    }));
  const cacheSources = sources.filter((source) => source.cache);
  const cache = cacheSources.length > 0
    ? {
        policy: "mixed",
        hitCount: cacheSources.filter((source) => source.cache?.hit === true).length,
        missCount: cacheSources.filter((source) => source.cache?.hit === false).length,
        staleCount: cacheSources.filter((source) => (source.cache?.freshnessSeconds ?? 0) > source.cache!.ttlSeconds).length,
      }
    : undefined;
  const newestCheckedAt = checkedTimes.at(-1);
  const freshnessSeconds = newestCheckedAt ? Math.max(0, Math.round((Date.now() - new Date(newestCheckedAt).getTime()) / 1000)) : undefined;
  const conflictCount = sources.filter((source) => source.status === "connected" && source.detail?.toLowerCase().includes("conflict")).length;
  const mode =
    conflictCount > 0
      ? "conflicting"
      : connectedSources === 0
        ? "unavailable"
        : freshnessSeconds !== undefined && freshnessSeconds > 86_400
          ? "stale"
          : unavailableSources > 0 || mockSources > 0
            ? "partial"
            : "live";

  return {
    mode,
    connectedSources,
    unavailableSources,
    mockSources,
    sourceCount,
    reliability,
    lastCheckedAt: newestCheckedAt,
    freshnessSeconds,
    averageLatencyMs: latencies.length > 0 ? Math.round(latencies.reduce((total, value) => total + value, 0) / latencies.length) : undefined,
    conflictCount,
    providerErrors,
    cache,
    detail:
      mode === "live"
        ? "All reported sources are connected live sources."
        : mode === "partial"
          ? "Some sources are unavailable or mock. Treat the result conservatively."
          : mode === "stale"
            ? "Connected sources are stale. Treat the result conservatively."
            : mode === "conflicting"
              ? "Connected sources reported conflicting signals. Use the conservative interpretation."
              : "No connected live source contributed to this result.",
  };
}

function confidenceFromSources(confidence: number | undefined, sources: AgentSource[]) {
  const dataQuality = getSourceDataQuality(sources);
  const base = confidence ?? 0.62;

  if (dataQuality.mode === "unavailable") {
    return Math.min(base, 0.28);
  }

  if (dataQuality.mode === "partial") {
    return Math.min(base, 0.64);
  }

  if (dataQuality.mode === "stale" || dataQuality.mode === "conflicting") {
    return Math.min(base, 0.58);
  }

  return base;
}

function getMissingData(sources: AgentSource[], missingData: AgentMissingData[] = []) {
  const sourceMissingData = sources
    .filter((source) => source.status === "unavailable")
    .map((source) => ({
      field: source.label,
      reason: source.detail ?? "Source unavailable.",
      impact: "medium" as const,
      requiredFor: "agent confidence",
      canRetry: true,
      fallbackUsed: source.fallbackRank !== undefined && source.fallbackRank > 0,
    }));

  return [...missingData, ...sourceMissingData];
}

function getBlockingReasons(findings: AgentFinding[], sources: AgentSource[], blockingReasons: string[] = []) {
  const criticalFindings = findings
    .filter((finding) => finding.severity === "critical")
    .map((finding) => finding.label);
  const noConnectedSources = sources.length > 0 && sources.every((source) => source.status !== "connected");

  return [
    ...blockingReasons,
    ...criticalFindings.map((label) => `Critical finding: ${label}`),
    ...(noConnectedSources ? ["No connected live source contributed to this result."] : []),
  ];
}

function getBlockingReasonDetails(findings: AgentFinding[], sources: AgentSource[], extra: AgentBlockingReason[] = []): AgentBlockingReason[] {
  const criticalFindings = findings
    .filter((finding) => finding.severity === "critical")
    .map((finding) => ({
      category: "critical" as const,
      severity: "critical" as const,
      detail: finding.detail,
      sourceLabel: finding.sourceLabel,
    }));
  const noConnectedSources = sources.length > 0 && sources.every((source) => source.status !== "connected")
    ? [
        {
          category: "provider_coverage" as const,
          severity: "high" as const,
          detail: "No connected live source contributed to this result.",
          sourceLabel: "source coverage",
        },
      ]
    : [];

  return [...extra, ...criticalFindings, ...noConnectedSources];
}

function getScoreBreakdown(findings: AgentFinding[]) {
  return findings.map((finding) => ({
    label: finding.label,
    severity: finding.severity,
    scoreImpact: finding.scoreImpact,
    weight: finding.weight,
    sourceLabel: finding.sourceLabel,
    confidence: finding.confidence,
  }));
}

function getStatus(dataQuality: SourceDataQuality, findings: AgentFinding[], riskLevel: RiskLevel, recommendedAction: AgentRecommendedAction): AgentResult["status"] {
  if (dataQuality.mode === "unavailable") return "unavailable";
  if (recommendedAction === "manual_review") return "manual_review_required";
  if (findings.some((finding) => finding.severity === "critical")) return "blocked";
  if (dataQuality.mode === "partial" || dataQuality.mode === "stale" || dataQuality.mode === "conflicting") return "partial";
  if (findings.some((finding) => finding.severity === "high") || riskLevel === "high" || riskLevel === "critical") return "warning";

  return "complete";
}

export function buildAgentResult(input: BuildAgentResultInput): AgentResult {
  const sources = input.sources ?? [
    {
      label: "Unavailable source",
      status: "unavailable" as const,
      detail: "No live source was supplied for this agent result.",
    },
  ];
  assertNoMockSourcesInLive(sources);
  const fallbackSource = sources[0]?.label ?? "Unavailable source";
  const findings = normalizeFindings(input.findings, fallbackSource);
  const riskScore = applyCriticalOverride(input.score, findings);
  const riskLevel = scoreToRiskLevel(riskScore);
  const dataQuality = getSourceDataQuality(sources);

  const result: AgentResult = {
    agent: input.agent,
    status: getStatus(dataQuality, findings, riskLevel, input.recommendedAction),
    riskScore,
    score: riskScore,
    riskLevel,
    verdict: input.verdict,
    summary: input.summary,
    findings,
    sources,
    dataQuality,
    confidence: confidenceFromSources(input.confidence, sources),
    recommendedAction: input.recommendedAction,
    blockingReasons: getBlockingReasons(findings, sources, input.blockingReasons),
    blockingReasonDetails: getBlockingReasonDetails(findings, sources, input.blockingReasonDetails),
    missingData: getMissingData(sources, input.missingData),
    rawSignals: {
      ...(input.rawSignals ?? {}),
      scoreBreakdown: (input.rawSignals?.scoreBreakdown as unknown) ?? getScoreBreakdown(findings),
      riskLevelThresholds,
    },
    createdAt: new Date().toISOString(),
  };

  const parsed = validateAgentResult(result);

  if (!parsed.success) {
    throw new Error(`Invalid AgentResult contract for ${input.agent}: ${parsed.error.message}`);
  }

  return result;
}

export function buildUnavailableAgentResult(
  agent: AgentResult["agent"],
  detail: string,
  recommendedAction: AgentRecommendedAction = "manual_review",
): AgentResult {
  return buildAgentResult({
    agent,
    score: 58,
    verdict: `${agent} source unavailable`,
    summary: `${agent} Agent could not complete. Decision Agent should treat this as missing data, not as a safe signal.`,
    findings: [
      {
        label: "Missing source",
        severity: "medium",
        detail,
        raw: "Agent call failed or provider was unavailable.",
        interpretation: "Manual review is required because this signal is incomplete.",
        sourceLabel: `${agent} agent`,
      },
    ],
    sources: [
      {
        label: `${agent} agent`,
        status: "unavailable",
        detail,
      },
    ],
    confidence: 0.18,
    recommendedAction,
  });
}

export async function runAgentSafely<T extends AgentResult["agent"]>(
  agent: T,
  task: () => Promise<AgentResult>,
): Promise<AgentResult> {
  try {
    return await task();
  } catch (error) {
    return buildUnavailableAgentResult(agent, error instanceof Error ? error.message : "Agent failed unexpectedly.");
  }
}
