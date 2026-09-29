/**
 * Report-level coverage.
 *
 * `complete` requires every claim to be corroborated by at least two
 * independent families with no conflict. Anything less is `partial`, with the
 * shortfall named rather than rounded away.
 */
import type { ClaimCoverage, EvidenceReportCoverage } from "./schema";

export function buildReportCoverage(claims: ClaimCoverage[], redactedFieldCount: number): EvidenceReportCoverage {
  if (claims.length === 0) {
    return {
      state: "empty",
      claimCount: 0,
      corroboratedClaimCount: 0,
      singleFamilyClaimCount: 0,
      incomparableClaimCount: 0,
      contradictedClaimCount: 0,
      uncoveredClaimCount: 0,
      redactedFieldCount,
      note: "The report carries no claims, so there is no coverage to assess.",
    };
  }

  const corroborated = claims.filter((claim) => claim.state === "corroborated").length;
  const singleFamily = claims.filter((claim) => claim.state === "single_family").length;
  const incomparable = claims.filter((claim) => claim.state === "incomparable").length;
  const contradicted = claims.filter((claim) => claim.state === "contradicted").length;
  const uncovered = claims.filter((claim) => claim.state === "uncovered").length;

  const complete = corroborated === claims.length;
  const reasons: string[] = [];

  if (singleFamily > 0) reasons.push(`${singleFamily} depend${singleFamily === 1 ? "s" : ""} on a single source family`);
  if (incomparable > 0) reasons.push(`${incomparable} ${incomparable === 1 ? "has" : "have"} several sources whose values could not be compared`);
  if (contradicted > 0) reasons.push(`${contradicted} carr${contradicted === 1 ? "ies" : "y"} a provable conflict`);
  if (uncovered > 0) reasons.push(`${uncovered} ${uncovered === 1 ? "has" : "have"} no usable observation`);

  return {
    state: complete ? "complete" : "partial",
    claimCount: claims.length,
    corroboratedClaimCount: corroborated,
    singleFamilyClaimCount: singleFamily,
    incomparableClaimCount: incomparable,
    contradictedClaimCount: contradicted,
    uncoveredClaimCount: uncovered,
    redactedFieldCount,
    note: complete
      ? "Every claim is corroborated by at least two independent source families with no conflict."
      : `Of ${claims.length} claims, ${reasons.join(", ")}.`,
  };
}
