/**
 * Stable identity for every factor in a report.
 *
 * Reports routinely repeat a label across agents ("Source coverage" appears in
 * both the decision and onchain cards) and occasionally within one agent. The
 * index keys on agent, category, label and a per-agent ordinal so a displayed
 * row always resolves back to exactly one original factor.
 */
import type { AdaptedReport } from "./reportAdapter";
import type { ExplanationAgentCard, ExplanationFactor } from "./schema";

export type IndexedFactor = {
  key: string;
  agent: string;
  agentDisplayName: string;
  agentStatus: string;
  agentScore: number;
  agentConfidence: number;
  /** Position inside the agent's own `factors` array, before any sorting. */
  position: number;
  critical: boolean;
  factor: ExplanationFactor;
};

export type FactorIndex = {
  entries: IndexedFactor[];
  byKey: Map<string, IndexedFactor>;
  byAgent: Map<string, IndexedFactor[]>;
  /** Labels that occur more than once anywhere in the report. */
  duplicatedLabels: Set<string>;
};

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unlabelled";
}

function isCritical(card: ExplanationAgentCard, factor: ExplanationFactor): boolean {
  if (factor.severity === "critical") return true;
  return (card.criticalFactors ?? []).some(
    (candidate) =>
      candidate.label === factor.label &&
      candidate.category === factor.category &&
      candidate.impact === factor.impact,
  );
}

/**
 * Builds the index. Input order is preserved in `position`, but the key itself
 * is derived from content plus a within-(agent, label) ordinal, so shuffling
 * the factor arrays of a report yields the same key set.
 */
export function buildFactorIndex(adapted: AdaptedReport): FactorIndex {
  const entries: IndexedFactor[] = [];
  const labelCounts = new Map<string, number>();

  for (const card of adapted.agentCards) {
    const ordered = card.factors
      .map((factor, position) => ({ factor, position }))
      .sort((left, right) => {
        const byLabel = left.factor.label.localeCompare(right.factor.label);
        if (byLabel !== 0) return byLabel;
        const byCategory = left.factor.category.localeCompare(right.factor.category);
        if (byCategory !== 0) return byCategory;
        const byImpact = left.factor.impact - right.factor.impact;
        if (byImpact !== 0) return byImpact;
        return left.factor.detail.localeCompare(right.factor.detail);
      });

    const ordinals = new Map<string, number>();

    for (const { factor, position } of ordered) {
      const base = `${card.agent}::${slug(factor.category)}::${slug(factor.label)}`;
      const ordinal = ordinals.get(base) ?? 0;
      ordinals.set(base, ordinal + 1);

      entries.push({
        key: ordinal === 0 ? base : `${base}#${ordinal + 1}`,
        agent: card.agent,
        agentDisplayName: card.displayName,
        agentStatus: card.status,
        agentScore: card.score,
        agentConfidence: card.confidence,
        position,
        critical: isCritical(card, factor),
        factor,
      });

      labelCounts.set(factor.label, (labelCounts.get(factor.label) ?? 0) + 1);
    }
  }

  entries.sort((left, right) => left.key.localeCompare(right.key));

  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const byAgent = new Map<string, IndexedFactor[]>();

  for (const entry of entries) {
    const bucket = byAgent.get(entry.agent);
    if (bucket) {
      bucket.push(entry);
    } else {
      byAgent.set(entry.agent, [entry]);
    }
  }

  const duplicatedLabels = new Set(
    [...labelCounts.entries()].filter(([, count]) => count > 1).map(([label]) => label),
  );

  return { entries, byKey, byAgent, duplicatedLabels };
}
