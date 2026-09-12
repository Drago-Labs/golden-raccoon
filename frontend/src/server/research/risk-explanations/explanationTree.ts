/**
 * Builds the drill-down tree: verdict, critical blockers, per-agent factors and
 * declared gaps. The tree references contributions by key rather than copying
 * them, so the table and the tree can never disagree about a row.
 */
import type { ExplanationContribution, ConfidenceGap, ExplanationNode, ExplanationSubject } from "./schema";

function factorNode(contribution: ExplanationContribution): ExplanationNode {
  const magnitude =
    contribution.kind === "scored" && contribution.impact !== null
      ? `impact ${contribution.impact}`
      : "no recorded impact";

  return {
    id: `factor:${contribution.key}`,
    kind: "factor",
    label: contribution.label,
    detail: `${contribution.agentDisplayName} · ${contribution.category} · ${magnitude}`,
    contributionKey: contribution.key,
    severity: contribution.severity,
    children: [],
  };
}

export function buildExplanationTree(
  subject: ExplanationSubject,
  contributions: ExplanationContribution[],
  gaps: ConfidenceGap[],
): ExplanationNode {
  const byAgent = new Map<string, ExplanationContribution[]>();

  for (const contribution of contributions) {
    const bucket = byAgent.get(contribution.agent);
    if (bucket) bucket.push(contribution);
    else byAgent.set(contribution.agent, [contribution]);
  }

  const blockers = contributions.filter((contribution) => contribution.critical);

  const agentNodes: ExplanationNode[] = [...byAgent.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([agent, entries]) => {
      const scored = entries.filter((entry) => entry.kind === "scored").length;

      return {
        id: `agent:${agent}`,
        kind: "agent" as const,
        label: entries[0]?.agentDisplayName ?? agent,
        detail: `${entries.length} factor${entries.length === 1 ? "" : "s"} · ${scored} with a recorded impact · status ${entries[0]?.agentStatus ?? "unknown"}`,
        children: entries.map(factorNode),
      };
    });

  const children: ExplanationNode[] = [
    {
      id: "verdict",
      kind: "verdict",
      label: `Verdict: ${subject.verdict}`,
      detail: subject.summary || "The report recorded no summary text.",
      children: [],
    },
    {
      id: "blockers",
      kind: "blockers",
      label: `Critical blockers (${blockers.length})`,
      detail:
        blockers.length > 0
          ? "Factors the report marked critical. They stay visible regardless of the active filter."
          : "The report recorded no critical factor.",
      severity: blockers.length > 0 ? "critical" : "low",
      children: blockers.map(factorNode),
    },
    ...agentNodes,
    {
      id: "gaps",
      kind: "gaps",
      label: `Declared gaps (${gaps.length})`,
      detail:
        gaps.length > 0
          ? "Missing evidence the report declared. Confidence is reported as-is and is not adjusted here."
          : "The report declared no missing evidence.",
      children: gaps.map((gap) => ({
        id: `gap:${gap.id}`,
        kind: "factor" as const,
        label: gap.field,
        detail: `${gap.scope} · ${gap.impact} impact · ${gap.reason}`,
        severity: gap.impact === "high" ? "high" : gap.impact,
        children: [],
      })),
    },
  ];

  return {
    id: "root",
    kind: "root",
    label: `${subject.asset.symbol} · buy risk ${subject.buyRisk}/100`,
    detail: `Report ${subject.reportId} on ${subject.asset.chain}. Confidence ${Math.round(subject.confidence * 100)}%.`,
    children,
  };
}
