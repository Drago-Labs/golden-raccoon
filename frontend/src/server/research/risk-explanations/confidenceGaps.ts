/**
 * Collects every gap the report itself declared, without inventing new ones.
 *
 * Gaps arrive from two places — the report-level `missingData` list and each
 * agent card's own list — and the same field can appear in both. Entries are
 * de-duplicated by scope and field so the panel does not double-count a gap the
 * decision core merely echoed.
 */
import type { AdaptedReport } from "./reportAdapter";
import type { ConfidenceGap } from "./schema";

export function collectConfidenceGaps(adapted: AdaptedReport): ConfidenceGap[] {
  const gaps = new Map<string, ConfidenceGap>();

  const add = (scope: string, entry: AdaptedReport["report"]["missingData"][number]) => {
    const id = `${scope}::${entry.field}`;
    if (gaps.has(id)) return;

    gaps.set(id, {
      id,
      field: entry.field,
      reason: entry.reason,
      impact: entry.impact,
      requiredFor: entry.requiredFor,
      canRetry: entry.canRetry ?? false,
      fallbackUsed: entry.fallbackUsed ?? false,
      scope,
    });
  };

  for (const entry of adapted.report.missingData) {
    add("report", entry);
  }

  for (const card of adapted.agentCards) {
    for (const entry of card.missingData) {
      add(card.agent, entry);
    }
  }

  const rank = { high: 0, medium: 1, low: 2 } as const;

  return [...gaps.values()].sort((left, right) => {
    const bySeverity = rank[left.impact] - rank[right.impact];
    if (bySeverity !== 0) return bySeverity;
    return left.id.localeCompare(right.id);
  });
}

/** Counts of unavailable sources, used to qualify the confidence figure. */
export function summarizeSourceHealth(adapted: AdaptedReport): {
  connected: number;
  unavailable: number;
  mock: number;
} {
  const seen = new Map<string, string>();

  for (const source of [...adapted.report.sources, ...adapted.agentCards.flatMap((card) => card.sources)]) {
    if (!seen.has(source.label)) seen.set(source.label, source.status);
  }

  let connected = 0;
  let unavailable = 0;
  let mock = 0;

  for (const status of seen.values()) {
    if (status === "connected") connected += 1;
    else if (status === "unavailable") unavailable += 1;
    else mock += 1;
  }

  return { connected, unavailable, mock };
}
