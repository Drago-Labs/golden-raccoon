import type { AgentResult } from "@/server/types";

export type AgentRunStatus = "running" | "partial" | "completed" | "cancelled" | "failed";

export function createAgentRunId(prefix = "agent_run") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createRunStepMetadata(runId: string, agent: AgentResult["agent"], attempt = 1) {
  return {
    runId,
    agent,
    attempt,
    sourceSnapshotImmutable: true,
    retryPolicy: {
      failedProviderRetryable: true,
      retryCreatesNewAttempt: true,
      sameRunIdAcrossAttempts: true,
    },
  };
}

export function markRunCancelled(runId: string, reason = "User cancelled the run.") {
  return {
    runId,
    status: "cancelled" as AgentRunStatus,
    reason,
    cancelledAt: new Date().toISOString(),
  };
}

export function getRunPartialStatus(results: AgentResult[]) {
  const failedAgents = results.filter((result) => result.status === "error" || result.status === "unavailable").map((result) => result.agent);

  return {
    partial: failedAgents.length > 0,
    failedAgents,
    userVisible: failedAgents.length > 0,
    detail: failedAgents.length > 0 ? `Partial result: ${failedAgents.join(", ")} did not complete with connected data.` : "All agent steps completed.",
  };
}

export function getRunDegradedStatus(results: AgentResult[]) {
  const degradedAgents = results
    .filter((r) => r.outcome === "degraded" || r.outcome === "skipped-by-breaker" || r.outcome === "skipped-by-deadline" || r.status === "partial" || r.status === "unavailable" || r.status === "error")
    .map((r) => r.agent);
  const skippedAgents = results
    .filter((r) => r.outcome === "skipped-by-breaker" || r.outcome === "skipped-by-deadline")
    .map((r) => r.agent);

  return {
    degraded: degradedAgents.length > 0,
    missingAgents: degradedAgents,
    skippedAgents,
    detail: degradedAgents.length > 0
      ? `Run completed with degraded signals from: ${degradedAgents.join(", ")}.`
      : "All agents succeeded with healthy signals.",
  };
}

