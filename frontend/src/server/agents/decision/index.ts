import type { AgentResult } from "@/server/types";
import { buildAgentResult, clampScore } from "@/server/agents/shared";

export function runDecisionAgent(input: { results?: AgentResult[] }): AgentResult {
  const results = input.results ?? [];
  const score = results.length
    ? clampScore(results.reduce((total, result) => total + result.score, 0) / results.length)
    : 50;
  const warnings = results.filter((result) => result.status === "warning").length;

  return buildAgentResult({
    agent: "decision",
    score,
    verdict: warnings > 0 ? "Reduce risk before approval" : "Hold and monitor",
    summary: results.length
      ? `Combined ${results.length} agent result${results.length === 1 ? "" : "s"} into one recommendation.`
      : "Decision agent is ready to aggregate portfolio, onchain, news and social outputs.",
    findings: [
      {
        label: "Agent inputs",
        severity: results.length >= 3 ? "low" : "medium",
        detail: `${results.length} agent result${results.length === 1 ? "" : "s"} supplied for aggregation.`,
      },
      {
        label: "Warnings",
        severity: warnings > 0 ? "high" : "low",
        detail: `${warnings} warning result${warnings === 1 ? "" : "s"} detected.`,
      },
    ],
    sources: results.map((result) => ({
      label: `${result.agent} agent`,
      status: "mock",
      detail: result.verdict,
    })),
    confidence: results.length >= 3 ? 0.58 : 0.32,
    recommendedAction: warnings > 0 ? "manual_review" : "watch",
  });
}
