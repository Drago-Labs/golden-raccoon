import { assertComparableIdentity } from "./identityGuard";
import { checkComparability } from "./comparability";
import { extractFactors, matchFactors } from "./factorMatching";
import { calculateScoreDelta } from "./scoreDelta";
import { calculateSourceDelta } from "./sourceDelta";
import { getSnapshotFingerprint, readSnapshotForComparison } from "./snapshotReader";
import {
  REPORT_COMPARISON_SCHEMA_VERSION,
  type ComparisonSubject,
  type ReportComparisonDocument,
  type ReportComparisonRequest,
} from "./schema";

function buildComparisonSummary(
  symbol: string,
  buyRiskDelta: number,
  confidenceDelta: number,
  factorSummary: {
    addedCount: number;
    removedCount: number;
    changedCount: number;
    criticalChangesCount: number;
    hasMaterialDelta: boolean;
  },
  sourceSummary: {
    disappearedCount: number;
  },
): string {
  const parts: string[] = [];

  if (buyRiskDelta !== 0) {
    const direction = buyRiskDelta > 0 ? "increased" : "decreased";
    parts.push(`Buy risk ${direction} by ${Math.abs(buyRiskDelta)} points`);
  } else {
    parts.push("Buy risk remained unchanged");
  }

  if (confidenceDelta !== 0) {
    const direction = confidenceDelta > 0 ? "improved" : "declined";
    parts.push(`confidence ${direction} by ${Math.abs(confidenceDelta)}`);
  }

  if (factorSummary.criticalChangesCount > 0) {
    parts.push(
      `${factorSummary.criticalChangesCount} critical risk factor${factorSummary.criticalChangesCount > 1 ? "s" : ""} changed`,
    );
  }

  if (factorSummary.addedCount > 0 || factorSummary.removedCount > 0) {
    parts.push(
      `${factorSummary.addedCount} factor${factorSummary.addedCount !== 1 ? "s" : ""} added and ${factorSummary.removedCount} factor${factorSummary.removedCount !== 1 ? "s" : ""} removed`,
    );
  }

  if (sourceSummary.disappearedCount > 0) {
    parts.push(
      `WARNING: ${sourceSummary.disappearedCount} evidence source${sourceSummary.disappearedCount !== 1 ? "s" : ""} disappeared between observations (missing evidence does NOT denote resolved risk)`,
    );
  }

  return `${symbol} comparison: ${parts.join("; ")}.`;
}

/**
 * Executes a semantic comparison between two immutable risk snapshot records
 * or documents. Evaluates score deltas, matches factors order-independently,
 * tracks evidence source transitions, and asserts input immutability.
 *
 * @param request - Validated comparison request containing snapshot ids or document objects.
 * @param options - Optional dependencies such as a custom storage adapter.
 * @returns Fully reconciled ReportComparisonDocument.
 */
export async function compareRiskSnapshots(
  request: ReportComparisonRequest,
  options: { adapter?: IStorageAdapter } = {},
): Promise<ReportComparisonDocument> {
  const baseLoaded = await readSnapshotForComparison(
    {
      id: request.baseId,
      document: request.baseSnapshot,
    },
    options.adapter,
  );

  const targetLoaded = await readSnapshotForComparison(
    {
      id: request.targetId,
      document: request.targetSnapshot,
    },
    options.adapter,
  );

  const baseBeforeFingerprint = getSnapshotFingerprint(baseLoaded.document);
  const targetBeforeFingerprint = getSnapshotFingerprint(targetLoaded.document);

  const verifiedIdentity = assertComparableIdentity(
    baseLoaded.document.asset,
    targetLoaded.document.asset,
  );

  const comparability = checkComparability(baseLoaded.document, targetLoaded.document);

  const baseFactors = extractFactors(baseLoaded.document, request.baseFactors);
  const targetFactors = extractFactors(targetLoaded.document, request.targetFactors);

  const factors = matchFactors(baseFactors, targetFactors);
  const scoreDelta = calculateScoreDelta(baseLoaded.document, targetLoaded.document);
  const sources = calculateSourceDelta(baseLoaded.document, targetLoaded.document);

  const baseGeneratedMs = new Date(baseLoaded.document.freshness.generatedAt).getTime();
  const targetGeneratedMs = new Date(targetLoaded.document.freshness.generatedAt).getTime();
  const timeElapsedSeconds =
    !Number.isNaN(baseGeneratedMs) && !Number.isNaN(targetGeneratedMs)
      ? Math.round((targetGeneratedMs - baseGeneratedMs) / 1000)
      : 0;

  const subject: ComparisonSubject = {
    canonicalIdentity: verifiedIdentity.canonicalIdentity,
    network: verifiedIdentity.network,
    chainFamily: verifiedIdentity.chainFamily,
    symbol: verifiedIdentity.symbol,
    asset: targetLoaded.document.asset,
    baseObservation: {
      id: baseLoaded.id,
      canonicalHash: baseLoaded.canonicalHash ?? baseBeforeFingerprint,
      generatedAt: baseLoaded.document.freshness.generatedAt,
      staleAt: baseLoaded.document.freshness.staleAt,
    },
    targetObservation: {
      id: targetLoaded.id,
      canonicalHash: targetLoaded.canonicalHash ?? targetBeforeFingerprint,
      generatedAt: targetLoaded.document.freshness.generatedAt,
      staleAt: targetLoaded.document.freshness.staleAt,
    },
    timeElapsedSeconds,
  };

  const summary = buildComparisonSummary(
    verifiedIdentity.symbol,
    scoreDelta.buyRisk.delta,
    scoreDelta.confidence.delta,
    factors.summary,
    sources.summary,
  );

  const baseAfterFingerprint = getSnapshotFingerprint(baseLoaded.document);
  const targetAfterFingerprint = getSnapshotFingerprint(targetLoaded.document);

  if (baseBeforeFingerprint !== baseAfterFingerprint || targetBeforeFingerprint !== targetAfterFingerprint) {
    throw new Error("Immutability violation: snapshot documents were mutated during comparison execution.");
  }

  return {
    schemaVersion: REPORT_COMPARISON_SCHEMA_VERSION,
    comparability,
    subject,
    scoreDelta,
    factors,
    sources,
    summary,
    notices: {
      informationOnly: true,
      disappearingSourcesAreNotResolvedRisks: true,
    },
  };
}
