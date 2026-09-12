/**
 * Source families.
 *
 * Families are *declared*. Nothing here infers that two sources share an
 * operator from a common label prefix or a similar name: guessing would either
 * invent independence where none exists, or destroy it where it does. A source
 * nobody placed in a family is its own family, which is the conservative
 * reading — it neither borrows nor lends corroboration.
 */
import type { FamilyInput } from "./schema";
import type { FamilyResolver } from "./sourceAdapter";
import type { SourceFamily, SourceObservation } from "./schema";

function normalize(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Builds a source family resolver and declared family listing from family definitions.
 *
 * @param families Declared source families
 * @returns Resolver function and declared source families list
 */
export function buildFamilyResolver(families: FamilyInput[]): {
  resolve: FamilyResolver;
  declared: SourceFamily[];
} {
  const byLabel = new Map<string, { familyId: string; familyLabel: string }>();

  for (const family of families) {
    for (const member of family.memberLabels) {
      if (!byLabel.has(normalize(member))) {
        byLabel.set(normalize(member), { familyId: family.familyId, familyLabel: family.label });
      }
    }
  }

  return {
    declared: families.map((family) => ({
      familyId: family.familyId,
      label: family.label,
      memberLabels: [...family.memberLabels].sort(),
      rationale: family.rationale,
    })),
    resolve(sourceLabel) {
      const declared = byLabel.get(normalize(sourceLabel));
      if (declared) return declared;

      return { familyId: `ungrouped:${normalize(sourceLabel)}`, familyLabel: sourceLabel.trim() };
    },
  };
}

export type FamilyBreakdown = {
  /** Distinct families with at least one usable observation. */
  independentFamilyCount: number;
  /** Observations beyond the first within each family. */
  redundantObservationCount: number;
  byFamily: Map<string, SourceObservation[]>;
};

/**
 * Counts independent source families and redundant observations within families.
 *
 * @param observations Collection of source observations
 * @returns Breakdown of independent family count, redundant count, and observations grouped by family
 */
export function analyseFamilies(observations: SourceObservation[]): FamilyBreakdown {
  const byFamily = new Map<string, SourceObservation[]>();

  for (const observation of observations) {
    const bucket = byFamily.get(observation.familyId);
    if (bucket) bucket.push(observation);
    else byFamily.set(observation.familyId, [observation]);
  }

  let independentFamilyCount = 0;
  let redundantObservationCount = 0;

  for (const bucket of byFamily.values()) {
    const usable = bucket.filter((observation) => observation.status !== "unavailable" && observation.value !== null);

    if (usable.length > 0) independentFamilyCount += 1;
    if (usable.length > 1) redundantObservationCount += usable.length - 1;
  }

  return { independentFamilyCount, redundantObservationCount, byFamily };
}

/**
 * Groups observations by family for presentation.
 *
 * @param observations Collection of source observations
 * @returns Array of family summaries with observation IDs and usable counts
 */
export function familySummaries(
  observations: SourceObservation[],
): Array<{ familyId: string; familyLabel: string; observationIds: string[]; usableCount: number }> {
  const { byFamily } = analyseFamilies(observations);

  return [...byFamily.entries()]
    .map(([familyId, bucket]) => ({
      familyId,
      familyLabel: bucket[0]?.familyLabel ?? familyId,
      observationIds: bucket.map((observation) => observation.observationId).sort(),
      usableCount: bucket.filter((observation) => observation.status !== "unavailable" && observation.value !== null).length,
    }))
    .sort((left, right) => left.familyId.localeCompare(right.familyId));
}
