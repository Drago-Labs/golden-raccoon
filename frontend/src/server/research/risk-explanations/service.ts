/**
 * Public entry point for the risk explanation workbench.
 *
 * `explainReport` is pure: it reads a report and returns a document. It holds
 * no state between calls, writes nothing, and asserts that the caller's report
 * is byte-equivalent after analysis.
 */
import { buildContributions, findContradictions, reconcileScores } from "./contributions";
import { collectConfidenceGaps, summarizeSourceHealth } from "./confidenceGaps";
import { buildEvidenceResolver } from "./evidenceLinks";
import { buildExplanationTree } from "./explanationTree";
import { buildFactorIndex } from "./factorIndex";
import { adaptReport, reportFingerprint } from "./reportAdapter";
import {
  EXPLANATION_SCHEMA_VERSION,
  ExplanationValidationError,
  explanationRequestSchema,
  type ExplanationCoverage,
  type RiskExplanation,
} from "./schema";

function buildCoverage(explanation: Omit<RiskExplanation, "coverage">): ExplanationCoverage {
  const total = explanation.contributions.length;
  const scored = explanation.contributions.filter((entry) => entry.kind === "scored").length;
  const resolved = explanation.contributions.filter((entry) => entry.evidence.state === "resolved").length;
  const labelOnly = explanation.contributions.filter((entry) => entry.evidence.state === "label_only").length;
  const unlinked = explanation.contributions.filter((entry) => entry.evidence.state === "unlinked").length;
  const ambiguous = explanation.contributions.filter((entry) => entry.evidence.state === "ambiguous").length;

  if (total === 0) {
    return {
      totalContributions: 0,
      scoredContributions: 0,
      descriptiveContributions: 0,
      resolvedEvidence: 0,
      labelOnlyEvidence: 0,
      unlinkedEvidence: 0,
      ambiguousEvidence: 0,
      criticalBlockers: 0,
      state: "empty",
      note: "The report is valid but carries no factors, so there is nothing to explain.",
    };
  }

  const complete = resolved === total && explanation.confidenceGaps.length === 0;

  return {
    totalContributions: total,
    scoredContributions: scored,
    descriptiveContributions: total - scored,
    resolvedEvidence: resolved,
    labelOnlyEvidence: labelOnly,
    unlinkedEvidence: unlinked,
    ambiguousEvidence: ambiguous,
    criticalBlockers: explanation.criticalBlockers.length,
    state: complete ? "complete" : "partial",
    note: complete
      ? "Every contribution resolved to a listed source and the report declared no missing evidence."
      : `${total - resolved} of ${total} contributions could not be resolved to a listed source, and the report declared ${explanation.confidenceGaps.length} gap${explanation.confidenceGaps.length === 1 ? "" : "s"}.`,
  };
}

export type ExplainResult = {
  explanation: RiskExplanation;
  contradictions: string[];
  sourceHealth: { connected: number; unavailable: number; mock: number };
};

/**
 * Analyses a report. Throws `ExplanationValidationError` for an unsupported
 * version or an unreadable shape; never throws for a report that is merely
 * empty or partially sourced.
 */
export function explainReport(input: unknown): ExplainResult {
  const parsed = explanationRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ExplanationValidationError("invalid_request", "The explanation request could not be read.", parsed.error.flatten());
  }

  const before = reportFingerprint(parsed.data.report);
  const adapted = adaptReport(parsed.data.report, parsed.data.reportVersion);
  const index = buildFactorIndex(adapted);
  const resolver = buildEvidenceResolver(adapted.report.sources, adapted.agentCards);
  const contributions = buildContributions(index, resolver.resolve);
  const gaps = collectConfidenceGaps(adapted);
  const criticalBlockers = contributions.filter((entry) => entry.critical);
  const sources = resolver.summarize(contributions.map((entry) => ({ key: entry.key, link: entry.evidence })));

  const partial = {
    schemaVersion: EXPLANATION_SCHEMA_VERSION,
    subject: adapted.subject,
    contributions,
    reconciliation: reconcileScores(adapted, index),
    tree: buildExplanationTree(adapted.subject, contributions, gaps),
    confidenceGaps: gaps,
    sources,
    criticalBlockers,
  } satisfies Omit<RiskExplanation, "coverage">;

  const explanation: RiskExplanation = { ...partial, coverage: buildCoverage(partial) };

  if (reportFingerprint(parsed.data.report) !== before) {
    throw new ExplanationValidationError("report_mutated", "Analysis modified the supplied report. This is a defect.");
  }

  return {
    explanation,
    contradictions: findContradictions(index),
    sourceHealth: summarizeSourceHealth(adapted),
  };
}

export { ExplanationValidationError } from "./schema";
export type { RiskExplanation } from "./schema";
