/**
 * Per-claim coverage.
 *
 * The state a claim lands in is decided by *independent families*, not by how
 * many observations it has. A claim with six observations from one vendor is
 * `single_family`, which is the same standing as a claim with one.
 */
import { analyseFamilies } from "./provenanceGroups";
import type { ClaimCoverage, ClaimInput, Contradiction, SourceObservation } from "./schema";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function subjectIdentityKey(subject: ClaimInput["subject"]): string {
  const discriminator = subject.issuer
    ? `issuer:${normalize(subject.issuer)}`
    : subject.contractAddress
      ? `contract:${normalize(subject.contractAddress)}`
      : `symbol:${normalize(subject.symbol)}`;

  return `${normalize(subject.chainId)}|${normalize(subject.symbol)}|${discriminator}`;
}

export function buildClaimCoverage(
  claim: ClaimInput,
  observations: SourceObservation[],
  contradictions: Contradiction[],
  agreeingPairCount: number,
): ClaimCoverage {
  const { independentFamilyCount, redundantObservationCount } = analyseFamilies(observations);

  const connectedCount = observations.filter((observation) => observation.status === "connected").length;
  const unavailableCount = observations.filter((observation) => observation.status === "unavailable").length;
  const freshCount = observations.filter((observation) => observation.freshness === "fresh").length;
  const staleCount = observations.filter((observation) => observation.freshness === "stale").length;
  const unknownFreshnessCount = observations.filter((observation) => observation.freshness === "unknown").length;

  const base = {
    claimId: claim.claimId,
    label: claim.label,
    subjectIdentityKey: subjectIdentityKey(claim.subject),
    observationIds: observations.map((observation) => observation.observationId).sort(),
    independentFamilyCount,
    redundantObservationCount,
    connectedCount,
    unavailableCount,
    freshCount,
    staleCount,
    unknownFreshnessCount,
    agreeingPairCount,
  };

  if (contradictions.length > 0) {
    return {
      ...base,
      state: "contradicted",
      note: `${contradictions.length} provable conflict${contradictions.length === 1 ? "" : "s"} between comparable observations. Both values are shown as reported; neither is preferred.`,
    };
  }

  if (independentFamilyCount === 0) {
    return {
      ...base,
      state: "uncovered",
      note:
        observations.length === 0
          ? "No observation backs this claim."
          : "Every observation for this claim came from an unavailable source or carried no value, so nothing backs it.",
    };
  }

  if (independentFamilyCount === 1) {
    const redundancyNote =
      redundantObservationCount > 0
        ? ` ${redundantObservationCount + 1} observations come from that one family; repeating a source is not corroboration.`
        : "";

    return {
      ...base,
      state: "single_family",
      note: `Backed by one declared source family.${redundancyNote} Treat this as one observation, not several.`,
    };
  }

  // Several families reporting is not corroboration unless at least one pair of
  // their values could actually be compared. Different units or disjoint
  // windows cannot manufacture a contradiction, and they must not manufacture
  // agreement either.
  if (agreeingPairCount === 0) {
    return {
      ...base,
      state: "incomparable",
      note: `${independentFamilyCount} independent source families reported, but no two of their values could be compared — differing units, non-overlapping windows, or free text. They neither agree nor disagree.`,
    };
  }

  return {
    ...base,
    state: "corroborated",
    note: `${independentFamilyCount} independent source families back this claim, with ${agreeingPairCount} comparable pair${agreeingPairCount === 1 ? "" : "s"} in agreement and no conflict.${
      redundantObservationCount > 0
        ? ` ${redundantObservationCount} further observation${redundantObservationCount === 1 ? " repeats" : "s repeat"} a family already counted.`
        : ""
    }`,
  };
}
