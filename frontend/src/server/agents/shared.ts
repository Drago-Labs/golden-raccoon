import type { AgentFinding, AgentRecommendedAction, AgentResult, AgentSource, SourceDataQuality } from "@/server/types";

type BuildAgentResultInput = {
  agent: AgentResult["agent"];
  score: number;
  verdict: string;
  summary: string;
  findings: AgentFinding[];
  sources?: AgentResult["sources"];
  confidence?: number;
  recommendedAction: AgentRecommendedAction;
};

export function clampScore(score: number) {
  return Math.min(100, Math.max(0, Math.round(score)));
}

function normalizeFindings(findings: AgentFinding[], sourceLabel: string) {
  return findings.map((finding) => ({
    ...finding,
    sourceLabel: finding.sourceLabel ?? sourceLabel,
    interpretation: finding.interpretation ?? finding.detail,
  }));
}

export function getSourceDataQuality(sources: AgentSource[]): SourceDataQuality {
  const connectedSources = sources.filter((source) => source.status === "connected").length;
  const unavailableSources = sources.filter((source) => source.status === "unavailable").length;
  const mockSources = sources.filter((source) => source.status === "mock").length;
  const mode = connectedSources === 0 ? "unavailable" : unavailableSources > 0 || mockSources > 0 ? "partial" : "live";

  return {
    mode,
    connectedSources,
    unavailableSources,
    mockSources,
    detail:
      mode === "live"
        ? "All reported sources are connected live sources."
        : mode === "partial"
          ? "Some sources are unavailable or mock. Treat the result conservatively."
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

  return base;
}

export function buildAgentResult(input: BuildAgentResultInput): AgentResult {
  const score = clampScore(input.score);
  const hasHighRiskFinding = input.findings.some((finding) => finding.severity === "high" || finding.severity === "critical");
  const sources = input.sources ?? [
    {
      label: "Unavailable source",
      status: "unavailable" as const,
      detail: "No live source was supplied for this agent result.",
    },
  ];
  const fallbackSource = sources[0]?.label ?? "Unavailable source";

  return {
    agent: input.agent,
    status: hasHighRiskFinding || score >= 71 ? "warning" : "complete",
    score,
    verdict: input.verdict,
    summary: input.summary,
    findings: normalizeFindings(input.findings, fallbackSource),
    sources,
    dataQuality: getSourceDataQuality(sources),
    confidence: confidenceFromSources(input.confidence, sources),
    recommendedAction: input.recommendedAction,
    createdAt: new Date().toISOString(),
  };
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
