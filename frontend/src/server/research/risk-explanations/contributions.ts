/**
 * Separates recorded score impacts from purely descriptive factors and, where
 * the scoring model permits it, reconciles them against the reported scores.
 *
 * The current scoring model records `impact` as a per-factor magnitude on a
 * 0-100 scale, not as an additive share of the agent score. Reconciliation
 * therefore only claims additivity when a card actually supplies weights that
 * reproduce its own score; otherwise the whole score is reported as
 * unexplained and the UI is told, in words, not to present a decomposition.
 */
import type { FactorIndex, IndexedFactor } from "./factorIndex";
import type { AdaptedReport } from "./reportAdapter";
import type {
  AgentReconciliation,
  EvidenceLink,
  ExplanationContribution,
  ExplanationContributionKind,
  ScoreReconciliation,
} from "./schema";

/** Weighted-mean reconstruction must land within this many points to count. */
const ADDITIVE_TOLERANCE = 0.5;

/** Classifies factors into descriptive context versus scored contributions. */
function classify(entry: IndexedFactor): ExplanationContributionKind {
  if (entry.factor.impact === 0 && entry.factor.direction === "neutral") return "descriptive";
  return "scored";
}

export function buildContributions(
  index: FactorIndex,
  resolveEvidence: (entry: IndexedFactor) => EvidenceLink,
): ExplanationContribution[] {
  return index.entries.map((entry) => {
    const kind = classify(entry);

    return {
      key: entry.key,
      agent: entry.agent,
      agentDisplayName: entry.agentDisplayName,
      agentStatus: entry.agentStatus,
      label: entry.factor.label,
      category: entry.factor.category,
      severity: entry.factor.severity,
      direction: entry.factor.direction,
      detail: entry.factor.detail,
      kind,
      impact: kind === "scored" ? entry.factor.impact : null,
      weight: entry.factor.weight ?? null,
      critical: entry.critical,
      evidence: resolveEvidence(entry),
    };
  });
}

function reconcileAgent(agent: string, entries: IndexedFactor[]): AgentReconciliation {
  const displayName = entries[0]?.agentDisplayName ?? agent;
  const reportedScore = entries[0]?.agentScore ?? 0;
  const scored = entries.filter((entry) => classify(entry) === "scored");
  const descriptiveCount = entries.length - scored.length;
  const qualifiers: string[] = [];

  const weighted = scored.filter((entry) => typeof entry.factor.weight === "number" && Number.isFinite(entry.factor.weight));
  const weightTotal = weighted.reduce((sum, entry) => sum + (entry.factor.weight ?? 0), 0);

  if (weighted.length === 0 || weightTotal <= 0) {
    qualifiers.push(
      "This agent records factor impacts as independent magnitudes, not as shares of its score. No decomposition is available.",
    );

    return {
      agent,
      agentDisplayName: displayName,
      model: scored.length === 0 ? "unavailable" : "non_additive",
      reportedScore,
      attributedScore: null,
      unexplainedRemainder: null,
      scoredFactorCount: scored.length,
      descriptiveFactorCount: descriptiveCount,
      qualifiers,
    };
  }

  if (weighted.length !== scored.length) {
    qualifiers.push(
      `${scored.length - weighted.length} of ${scored.length} scored factors carry no weight, so a weighted reconstruction would be partial.`,
    );

    return {
      agent,
      agentDisplayName: displayName,
      model: "non_additive",
      reportedScore,
      attributedScore: null,
      unexplainedRemainder: null,
      scoredFactorCount: scored.length,
      descriptiveFactorCount: descriptiveCount,
      qualifiers,
    };
  }

  const attributed = weighted.reduce((sum, entry) => sum + entry.factor.impact * (entry.factor.weight ?? 0), 0) / weightTotal;
  const remainder = reportedScore - attributed;

  if (Math.abs(remainder) > ADDITIVE_TOLERANCE) {
    qualifiers.push(
      `The weighted reconstruction lands ${remainder.toFixed(2)} points away from the reported score, so the factors do not fully explain it.`,
    );

    return {
      agent,
      agentDisplayName: displayName,
      model: "non_additive",
      reportedScore,
      attributedScore: Number(attributed.toFixed(4)),
      unexplainedRemainder: Number(remainder.toFixed(4)),
      scoredFactorCount: scored.length,
      descriptiveFactorCount: descriptiveCount,
      qualifiers,
    };
  }

  qualifiers.push("Every scored factor carries a weight and the weighted mean reproduces the reported score.");

  return {
    agent,
    agentDisplayName: displayName,
    model: "additive",
    reportedScore,
    attributedScore: Number(attributed.toFixed(4)),
    unexplainedRemainder: Number(remainder.toFixed(4)),
    scoredFactorCount: scored.length,
    descriptiveFactorCount: descriptiveCount,
    qualifiers,
  };
}

export function reconcileScores(adapted: AdaptedReport, index: FactorIndex): ScoreReconciliation {
  const perAgent = [...index.byAgent.entries()]
    .map(([agent, entries]) => reconcileAgent(agent, entries))
    .sort((left, right) => left.agent.localeCompare(right.agent));

  const qualifiers = [
    "Buy risk is produced by a weighted aggregation across specialist agents; individual factor impacts are magnitudes on a 0-100 scale and do not sum to it.",
  ];

  const conflicting = index.entries.filter((entry) => {
    const sign = entry.factor.impact === 0 ? 0 : entry.factor.impact > 0 ? 1 : -1;
    if (entry.factor.direction === "risk_increase" && sign < 0) return true;
    if (entry.factor.direction === "risk_decrease" && sign > 0) return true;
    return false;
  });

  if (conflicting.length > 0) {
    qualifiers.push(
      `${conflicting.length} factor${conflicting.length === 1 ? "" : "s"} declare a direction that contradicts the sign of the recorded impact. Those rows are shown as reported and are excluded from any reconstruction.`,
    );
  }

  if (index.duplicatedLabels.size > 0) {
    qualifiers.push(
      `${index.duplicatedLabels.size} label${index.duplicatedLabels.size === 1 ? " is" : "s are"} used by more than one factor. Rows stay distinct by agent and category.`,
    );
  }

  return {
    model: "non_additive",
    reportedBuyRisk: adapted.subject.buyRisk,
    attributedBuyRisk: null,
    unexplainedRemainder: null,
    perAgent,
    qualifiers,
  };
}

/** Factors whose declared direction contradicts the sign of their impact. */
export function findContradictions(index: FactorIndex): string[] {
  return index.entries
    .filter((entry) => {
      if (entry.factor.impact === 0) return false;
      if (entry.factor.direction === "risk_increase") return entry.factor.impact < 0;
      if (entry.factor.direction === "risk_decrease") return entry.factor.impact > 0;
      return false;
    })
    .map((entry) => entry.key);
}
