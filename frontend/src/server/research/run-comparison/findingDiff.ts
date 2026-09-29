/**
 * Pairing findings within one agent.
 *
 * Findings have no id, so identity is their label. That works until a run
 * carries the same label twice — at which point the pairing is genuinely
 * undetermined, and the honest answer is `ambiguous` rather than a guess.
 *
 * A wrong pairing is worse than an admitted one: it shows a severity or score
 * "change" between two findings that were never the same finding.
 */
import type { AgentFinding } from "@/server/types";
import { COMPARISON_LIMITS, type FindingPair } from "./schema";

function identityOf(finding: AgentFinding): string {
  return String(finding.label ?? "").trim().toLowerCase();
}

function side(finding: AgentFinding | undefined): FindingPair["left"] {
  if (!finding) return null;

  return {
    severity: String(finding.severity ?? "unknown"),
    detail: String(finding.detail ?? ""),
    scoreImpact: Number.isFinite(finding.scoreImpact) ? Number(finding.scoreImpact) : null,
  };
}

function group(findings: AgentFinding[]): Map<string, AgentFinding[]> {
  const map = new Map<string, AgentFinding[]>();

  for (const finding of findings.slice(0, COMPARISON_LIMITS.maxFindingsPerAgent)) {
    const identity = identityOf(finding);
    const existing = map.get(identity);

    if (existing) existing.push(finding);
    else map.set(identity, [finding]);
  }

  return map;
}

export function diffFindings(agent: string, left: AgentFinding[], right: AgentFinding[]): FindingPair[] {
  const leftGroups = group(left);
  const rightGroups = group(right);
  const identities = [...new Set([...leftGroups.keys(), ...rightGroups.keys()])].sort();

  return identities.map((identity, index) => {
    const leftMatches = leftGroups.get(identity) ?? [];
    const rightMatches = rightGroups.get(identity) ?? [];
    const label = leftMatches[0]?.label ?? rightMatches[0]?.label ?? identity;
    const pairId = `${agent}-${index}`;

    // More than one finding on either side sharing an identity: the pairing is
    // not determined, so none is asserted.
    if (leftMatches.length > 1 || rightMatches.length > 1) {
      return {
        pairId,
        alignment: "ambiguous",
        label: String(label),
        left: side(leftMatches[0]),
        right: side(rightMatches[0]),
        ambiguityNote: `This label appears ${leftMatches.length} time(s) in the first run and ${rightMatches.length} time(s) in the second, so which finding corresponds to which is not determined. No change is claimed between them.`,
      } satisfies FindingPair;
    }

    if (leftMatches.length === 1 && rightMatches.length === 1) {
      return {
        pairId,
        alignment: "matched",
        label: String(label),
        left: side(leftMatches[0]),
        right: side(rightMatches[0]),
        ambiguityNote: null,
      } satisfies FindingPair;
    }

    return {
      pairId,
      alignment: leftMatches.length === 1 ? "removed" : "added",
      label: String(label),
      left: side(leftMatches[0]),
      right: side(rightMatches[0]),
      ambiguityNote: null,
    } satisfies FindingPair;
  });
}
