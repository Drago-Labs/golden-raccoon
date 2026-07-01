import type { AgentResult } from "@/server/types";
import { buildAgentResult } from "@/server/agents/shared";

export function runSocialAgent(input: { query?: string }): AgentResult {
  const query = input.query?.trim() || "token community";

  return buildAgentResult({
    agent: "social",
    score: 55,
    verdict: "Social quality requires review",
    summary: `${query} social analysis is running in MVP fallback mode. Real X/API enrichment is not connected yet.`,
    findings: [
      {
        label: "Engagement quality",
        severity: "medium",
        detail: "Engagement, shill density and influencer concentration need a live social data source.",
      },
      {
        label: "Phishing signals",
        severity: "medium",
        detail: "Giveaway, impersonation and malicious-link checks are queued for provider integration.",
      },
    ],
    sources: [
      {
        label: "Social provider",
        status: "unavailable",
        detail: "X/Twitter, Apify, Tavily or SerpAPI source is not connected.",
      },
    ],
    confidence: 0.34,
    recommendedAction: "manual_review",
  });
}
