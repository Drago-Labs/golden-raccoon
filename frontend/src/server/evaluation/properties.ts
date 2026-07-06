import type { AgentResult } from "@/server/types";
import { runDecisionAgent } from "@/server/agents/decision";

export function missingDataDoesNotIncreaseConfidence(before: AgentResult, after: AgentResult) {
  return after.missingData.length > before.missingData.length ? after.confidence <= before.confidence : true;
}

export function criticalFindingDoesNotLowerRisk(before: AgentResult, after: AgentResult) {
  const hasNewCritical = after.findings.some((finding) => finding.severity === "critical") && !before.findings.some((finding) => finding.severity === "critical");

  return hasNewCritical ? after.riskScore >= before.riskScore : true;
}

export function reliableSourcesDoNotLowerConfidence(before: AgentResult, after: AgentResult) {
  const beforeConnected = before.sources.filter((source) => source.status === "connected").length;
  const afterConnected = after.sources.filter((source) => source.status === "connected").length;
  const conflicting = after.dataQuality.mode === "conflicting";

  return afterConnected > beforeConnected && !conflicting ? after.confidence >= before.confidence : true;
}

export function noAgentResultRequiresManualReview() {
  return runDecisionAgent({ results: [] }).recommendedAction === "manual_review";
}
