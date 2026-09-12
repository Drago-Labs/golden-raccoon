/**
 * Public entry point for snapshot comparison.
 *
 * `compareSnapshots` reads two snapshots through the existing integrity gate,
 * requires them to describe the same asset on the same network, and returns a
 * descriptive delta. It performs no write: no snapshot is created, revoked,
 * refreshed or has its expiry extended anywhere in this path.
 */
import type { IStorageAdapter } from "@/server/storage/adapters/types";
import { assessComparability, describeObservation } from "./comparability";
import { matchMissingData, matchTopReasons, missingDataAsFactors } from "./factorMatching";
import { assertSameSubject } from "./identityGuard";
import { buildScoreDeltas, buildVerdictDelta } from "./scoreDelta";
import { buildSourceDeltas } from "./sourceDelta";
import { orderByObservation, readSnapshotPair } from "./snapshotReader";
import {
  COMPARISON_SCHEMA_VERSION,
  ComparisonError,
  comparisonRequestSchema,
  type ComparisonCoverage,
  type ReportComparison,
} from "./schema";

function buildCoverage(comparison: Omit<ReportComparison, "coverage" | "materiallyIdentical">): ComparisonCoverage {
  const lost = comparison.sources.filter((source) => source.evidenceLost).length;
  const gained = comparison.sources.filter((source) => source.status === "added" || (source.status === "changed" && !source.evidenceLost)).length;
  const changedFactors = comparison.factors.filter((factor) => factor.status !== "unchanged").length;
  const ambiguous = comparison.factors.filter((factor) => factor.status === "ambiguous").length;

  if (comparison.sources.length === 0 && comparison.factors.length === 0) {
    return {
      state: "empty",
      comparedSources: 0,
      lostSources: 0,
      gainedSources: 0,
      changedFactors: 0,
      ambiguousFactors: 0,
      note: "Both snapshots are valid but carry no evidence entries and no narrative items, so there is nothing to compare.",
    };
  }

  const partial = lost > 0 || ambiguous > 0 || comparison.comparability.caveats.length > 0;

  return {
    state: partial ? "partial" : "complete",
    comparedSources: comparison.sources.length,
    lostSources: lost,
    gainedSources: gained,
    changedFactors,
    ambiguousFactors: ambiguous,
    note: partial
      ? `${lost} source${lost === 1 ? "" : "s"} stopped being observable and ${ambiguous} narrative item${ambiguous === 1 ? "" : "s"} could not be matched one to one. Read the differences as partial.`
      : "Every source and narrative item on both sides was matched, and no caveat applies.",
  };
}

export async function compareSnapshots(
  input: unknown,
  adapter?: IStorageAdapter,
): Promise<ReportComparison> {
  const parsed = comparisonRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ComparisonError("invalid_request", parsed.error.issues[0]?.message ?? "The comparison request could not be read.");
  }

  const pair = orderByObservation(await readSnapshotPair(parsed.data.leftId, parsed.data.rightId, adapter));
  const asset = assertSameSubject(pair.left, pair.right);
  const comparability = assessComparability(pair.left, pair.right);

  const leftDocument = pair.left.document;
  const rightDocument = pair.right.document;

  const missingData = matchMissingData(leftDocument.missingData, rightDocument.missingData);
  const factors = [...matchTopReasons(leftDocument.topReasons, rightDocument.topReasons), ...missingDataAsFactors(missingData)];
  const sources = buildSourceDeltas(leftDocument.evidence, rightDocument.evidence);
  const scores = buildScoreDeltas(leftDocument.scores, rightDocument.scores);
  const verdict = buildVerdictDelta(leftDocument.verdict, rightDocument.verdict);

  const partial = {
    schemaVersion: COMPARISON_SCHEMA_VERSION,
    asset,
    left: describeObservation(pair.left),
    right: describeObservation(pair.right),
    comparability,
    scores,
    verdict,
    factors,
    missingData,
    sources,
  } satisfies Omit<ReportComparison, "coverage" | "materiallyIdentical">;

  const materiallyIdentical =
    !verdict.changed &&
    scores.every((delta) => delta.direction === "unchanged") &&
    factors.every((factor) => factor.status === "unchanged") &&
    sources.every((source) => source.status === "unchanged");

  return { ...partial, coverage: buildCoverage(partial), materiallyIdentical };
}

export { ComparisonError } from "./schema";
export type { ReportComparison } from "./schema";
