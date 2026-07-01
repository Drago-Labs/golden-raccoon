import type { AgentFinding, AgentRecommendedAction, AgentResult, RiskLevel } from "@/server/types";
import { buildAgentResult, clampScore } from "@/server/agents/shared";

type DecisionInput = {
  results?: AgentResult[];
};

const agentWeights: Partial<Record<AgentResult["agent"], number>> = {
  onchain: 0.52,
  portfolio: 0.2,
  news: 0.16,
  social: 0.12,
  execution: 0,
  decision: 0,
};

function findingScore(severity: RiskLevel) {
  return {
    low: 18,
    medium: 48,
    high: 78,
    critical: 96,
  }[severity];
}

function getWeightedScore(results: AgentResult[]) {
  const weighted = results.reduce(
    (total, result) => {
      const weight = agentWeights[result.agent] ?? 0.1;

      return {
        score: total.score + result.score * weight,
        weight: total.weight + weight,
      };
    },
    { score: 0, weight: 0 },
  );

  if (weighted.weight === 0) {
    return 50;
  }

  return clampScore(weighted.score / weighted.weight);
}

function hasCriticalFinding(results: AgentResult[]) {
  return results.some((result) => result.findings.some((finding) => finding.severity === "critical"));
}

function getWorstFindings(results: AgentResult[]) {
  return results
    .flatMap((result) =>
      result.findings.map((finding) => ({
        ...finding,
        agent: result.agent,
        score: findingScore(finding.severity),
      })),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function decideAction(score: number, critical: boolean): AgentRecommendedAction {
  if (critical || score >= 85) {
    return "avoid";
  }

  if (score >= 72) {
    return "manual_review";
  }

  if (score >= 58) {
    return "watch";
  }

  return "hold";
}

function verdictForAction(action: AgentRecommendedAction) {
  if (action === "avoid") {
    return "Avoid token";
  }

  if (action === "manual_review") {
    return "Manual review required";
  }

  if (action === "watch") {
    return "Watch before buying";
  }

  return "No major blocker";
}

function buildDecisionFindings(results: AgentResult[], score: number, action: AgentRecommendedAction): AgentFinding[] {
  const worstFindings = getWorstFindings(results);
  const connectedSources = results.flatMap((result) => result.sources).filter((source) => source.status === "connected").length;
  const unavailableSources = results.flatMap((result) => result.sources).filter((source) => source.status === "unavailable").length;

  return [
    {
      label: "Weighted agent score",
      severity: score >= 85 ? "critical" : score >= 72 ? "high" : score >= 58 ? "medium" : "low",
      detail: `Weighted score is ${score}/100. Recommended action: ${action.replaceAll("_", " ")}.`,
    },
    {
      label: "Top decision reasons",
      severity: worstFindings.some((finding) => finding.severity === "critical") ? "critical" : worstFindings.some((finding) => finding.severity === "high") ? "high" : "medium",
      detail:
        worstFindings.length > 0
          ? worstFindings.map((finding) => `${finding.agent}: ${finding.label}`).join("; ")
          : "No agent findings were supplied.",
    },
    {
      label: "Source coverage",
      severity: unavailableSources > connectedSources ? "medium" : "low",
      detail: `${connectedSources} connected source${connectedSources === 1 ? "" : "s"} and ${unavailableSources} unavailable source${unavailableSources === 1 ? "" : "s"} contributed to this decision.`,
    },
  ];
}

function confidenceFromCoverage(results: AgentResult[]) {
  if (results.length === 0) {
    return 0.22;
  }

  const sourceCount = results.flatMap((result) => result.sources).length;
  const connectedCount = results.flatMap((result) => result.sources).filter((source) => source.status === "connected").length;
  const averageAgentConfidence = results.reduce((total, result) => total + result.confidence, 0) / results.length;
  const sourceCoverage = sourceCount > 0 ? connectedCount / sourceCount : 0;

  return Math.min(0.86, Math.max(0.28, averageAgentConfidence * 0.65 + sourceCoverage * 0.35));
}

export function runDecisionAgent(input: DecisionInput): AgentResult {
  const results = (input.results ?? []).filter((result) => result.agent !== "decision");
  const score = getWeightedScore(results);
  const critical = hasCriticalFinding(results);
  const recommendedAction = decideAction(score, critical);
  const findings = buildDecisionFindings(results, score, recommendedAction);

  return buildAgentResult({
    agent: "decision",
    score,
    verdict: verdictForAction(recommendedAction),
    summary:
      results.length > 0
        ? `Decision Agent combined ${results.map((result) => result.agent).join(", ")} signals into a ${recommendedAction.replaceAll("_", " ")} recommendation.`
        : "Decision Agent needs specialist agent results before producing a recommendation.",
    findings,
    sources: results.map((result) => ({
      label: `${result.agent} agent`,
      status: result.sources.some((source) => source.status === "connected") ? "connected" : result.sources.length > 0 ? "unavailable" : "mock",
      detail: `${result.verdict}: ${result.summary}`,
    })),
    confidence: confidenceFromCoverage(results),
    recommendedAction,
  });
}
