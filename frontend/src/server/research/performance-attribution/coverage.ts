import type { PeriodAttribution, PortfolioObservation } from "./schema";

/** Why one period could not be fully attributed, in plain words. */
export function periodNotes(
  start: PortfolioObservation | null,
  end: PortfolioObservation | null,
  assetsPartial: boolean,
): { state: PeriodAttribution["state"]; notes: string[] } {
  const notes: string[] = [];
  if (!start && !end) {
    return {
      state: "unavailable",
      notes: ["No recorded observation bounds this period, so nothing is attributed to it. No value was carried over from a neighbouring period."],
    };
  }
  if (!start) {
    return {
      state: "unavailable",
      notes: ["No recorded observation at or before the start of this period, so its change cannot be measured."],
    };
  }
  if (!end) {
    return {
      state: "unavailable",
      notes: ["No recorded observation inside this period, so its change cannot be measured."],
    };
  }
  if (!start.fullyPriced || !end.fullyPriced) {
    notes.push("At least one holding had no usable price in a bounding observation, so that asset's figures are stated as unavailable rather than as zero.");
  }
  if (assetsPartial) {
    notes.push("At least one asset could not be attributed, so this period's totals cover only the assets that could be.");
  }
  return { state: notes.length ? "partial" : "complete", notes };
}

/** What the report as a whole rests on and what it does not cover. */
export function reportCoverage(
  periods: PeriodAttribution[],
  observations: PortfolioObservation[],
  flows: { count: number; truncated: boolean },
): string[] {
  const notes = [
    "Change in value is measured between recorded portfolio observations; no value is interpolated between them.",
    "External flows are read from the transaction-history read API and subtracted before anything is attributed to the market, so a deposit is never a gain and a withdrawal is never a loss.",
    "Market movement is split into the price effect on units held at the start of a period and a residual covering units acquired or released during it; flow, price effect and residual add back to the observed change exactly.",
    `${observations.length} recorded observation(s) and ${flows.count} external flow(s) were used.`,
  ];
  const unavailable = periods.filter((period) => period.state === "unavailable");
  const partial = periods.filter((period) => period.state === "partial");
  if (unavailable.length) {
    notes.push(`${unavailable.length} period(s) have no bounding observation and are reported as unavailable rather than filled: ${unavailable.map((period) => period.label).join(", ")}.`);
  }
  if (partial.length) {
    notes.push(`${partial.length} period(s) are missing a price or an asset and are reported as partial: ${partial.map((period) => period.label).join(", ")}.`);
  }
  if (flows.truncated) {
    notes.push("The transfer history filled this reader's page budget, so earlier flows in the window may be missing and the separation of flows from market movement is incomplete.");
  }
  notes.push("This is an attribution of observed value, not tax reporting and not advice.");
  return notes;
}
