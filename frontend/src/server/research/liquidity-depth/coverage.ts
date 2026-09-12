/**
 * Report-level coverage across every venue.
 *
 * A report is `complete` only when every venue was modelled, fresh and
 * untruncated. Anything less is `partial`, with the reason stated — never a
 * silent downgrade.
 */
import type { LiquidityCoverage, VenueAnalysis } from "./schema";

export function buildCoverage(venues: VenueAnalysis[]): LiquidityCoverage {
  if (venues.length === 0) {
    return {
      state: "empty",
      venueCount: 0,
      modelledVenueCount: 0,
      staleVenueCount: 0,
      truncatedVenueCount: 0,
      unsupportedVenueCount: 0,
      note: "No venue snapshot was supplied, so there is no depth to analyse.",
    };
  }

  const modelled = venues.filter((venue) => venue.venue.model !== "unsupported_model");
  const unsupported = venues.length - modelled.length;
  const stale = venues.filter((venue) => venue.qualifications.some((reason) => reason.includes("freshness bound"))).length;
  const truncated = venues.filter((venue) => venue.venue.truncated).length;
  const unavailable = venues.filter((venue) => venue.state === "unavailable").length;

  const complete = unsupported === 0 && stale === 0 && truncated === 0 && unavailable === 0;
  const reasons: string[] = [];

  if (unsupported > 0) reasons.push(`${unsupported} venue${unsupported === 1 ? " uses" : "s use"} a model this workbench does not implement`);
  if (stale > 0) reasons.push(`${stale} snapshot${stale === 1 ? " is" : "s are"} past the freshness bound`);
  if (truncated > 0) reasons.push(`${truncated} snapshot${truncated === 1 ? " was" : "s were"} truncated by the source`);
  if (unavailable > 0) reasons.push(`${unavailable} venue${unavailable === 1 ? " returned" : "s returned"} no usable depth`);

  return {
    state: complete ? "complete" : "partial",
    venueCount: venues.length,
    modelledVenueCount: modelled.length,
    staleVenueCount: stale,
    truncatedVenueCount: truncated,
    unsupportedVenueCount: unsupported,
    note: complete
      ? "Every venue was modelled from a fresh, untruncated snapshot."
      : `Read this report as partial: ${reasons.join("; ")}.`,
  };
}
