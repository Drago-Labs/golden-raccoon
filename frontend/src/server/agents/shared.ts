import type { AgentFinding, AgentRecommendedAction, AgentResult } from "@/server/types";

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

export function buildAgentResult(input: BuildAgentResultInput): AgentResult {
  const score = clampScore(input.score);
  const hasHighRiskFinding = input.findings.some((finding) => finding.severity === "high" || finding.severity === "critical");

  return {
    agent: input.agent,
    status: hasHighRiskFinding || score >= 71 ? "warning" : "complete",
    score,
    verdict: input.verdict,
    summary: input.summary,
    findings: input.findings,
    sources: input.sources ?? [
      {
        label: "MVP local analysis",
        status: "mock",
        detail: "Deterministic placeholder until the real provider is connected.",
      },
    ],
    confidence: input.confidence ?? 0.62,
    recommendedAction: input.recommendedAction,
    createdAt: new Date().toISOString(),
  };
}
