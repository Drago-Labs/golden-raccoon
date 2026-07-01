import type { AgentResult } from "@/server/types";
import { buildAgentResult } from "@/server/agents/shared";

export function runExecutionAgent(input: { action?: string; percent?: number }): AgentResult {
  const percent = typeof input.percent === "number" ? Math.min(100, Math.max(0, input.percent)) : 0;
  const action = input.action || "no action";

  return buildAgentResult({
    agent: "execution",
    score: percent > 50 ? 72 : 28,
    verdict: "Approval required",
    summary: `Execution agent prepared a dry-run ${action} plan. Real auto-execution is disabled for MVP.`,
    findings: [
      {
        label: "Approval policy",
        severity: "low",
        detail: "Every blockchain action requires explicit wallet approval.",
      },
      {
        label: "Trade size",
        severity: percent > 50 ? "high" : "low",
        detail: `Requested action size is ${percent}%.`,
      },
    ],
    sources: [
      {
        label: "Execution policy",
        status: "mock",
        detail: "Approval-only MVP policy.",
      },
    ],
    confidence: 0.66,
    recommendedAction: percent > 0 ? "prepare_transaction" : "no_action",
  });
}
