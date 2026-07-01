import type { AgentResult } from "@/server/types";
import { buildAgentResult } from "@/server/agents/shared";

export function runNewsAgent(input: { tokenName?: string; symbol?: string; contractAddress?: string }): AgentResult {
  const subject = input.symbol || input.tokenName || input.contractAddress || "token";

  return buildAgentResult({
    agent: "news",
    score: 42,
    verdict: "No critical news detected",
    summary: `${subject} has no connected news feed yet. MVP result keeps the decision flow explicit instead of inventing live coverage.`,
    findings: [
      {
        label: "Catalyst coverage",
        severity: "medium",
        detail: "Real RSS/API source is not connected yet, so catalysts are marked for manual review.",
      },
      {
        label: "Negative mentions",
        severity: "medium",
        detail: "Scam, exploit and regulatory mention checks are pending provider integration.",
      },
    ],
    sources: [
      {
        label: "News provider",
        status: "unavailable",
        detail: "CryptoPanic/RSS integration is listed for Phase 4.",
      },
    ],
    confidence: 0.36,
    recommendedAction: "manual_review",
  });
}
