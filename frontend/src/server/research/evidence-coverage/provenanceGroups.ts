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

export function buildFamilyResolver(families: FamilyInput[]): {
  resolve: FamilyResolver;
  declared: SourceFamily[];
} {
  const byLabel = new Map<string, { familyId: string; familyLabel: string }>();

  for (const family of families) {
    for (const member of family.memberLabels) {
      // First declaration wins. A label claimed by two families is ambiguous,
      // and silently picking the later one would change corroboration counts
      // depending on input order.
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

      // Undeclared sources stand alone rather than being pooled together.
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
 * Counts independence, not volume.
 *
 * Only observations from a connected source with a value count toward
 * independence: an unavailable source corroborates nothing. Within a family,
 * every observation after the first is redundant for corroboration purposes,
 * however many there are.
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

/** Observations grouped for display, one entry per family. */
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
