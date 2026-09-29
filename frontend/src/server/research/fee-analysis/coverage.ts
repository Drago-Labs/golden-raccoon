/**
 * How much of the requested history the report actually covers.
 *
 * The distinction this module exists to preserve: a report over ten records
 * where two fee reads failed is *partial*, and saying so is the difference
 * between a total a reader can act on and one that quietly understates what
 * the wallet paid.
 */
import type { AssetTotal, ExcludedRecord, FeeCharge, FeeCoverage, NetworkTotal } from "./schema";

export function buildCoverage(input: {
  recordCount: number;
  charges: FeeCharge[];
  excluded: ExcludedRecord[];
  readsUsed: number;
  readBudget: number;
  byNetwork: NetworkTotal[];
}): FeeCoverage {
  const { recordCount, charges, excluded, readsUsed, readBudget, byNetwork } = input;

  const observedCount = charges.filter((charge) => charge.evidence === "observed").length;
  const unknownCount = charges.filter((charge) => charge.evidence === "unknown").length;
  const assets: AssetTotal[] = byNetwork.flatMap((network) => network.byAsset);
  const fiatIncomplete = assets.some((asset) => asset.fiat === null);

  const shared = {
    recordCount,
    chargeCount: charges.length,
    observedCount,
    unknownCount,
    excludedCount: excluded.length,
    readsUsed,
    readBudget,
    fiatIncomplete,
  };

  if (recordCount === 0) {
    return {
      ...shared,
      state: "empty",
      note: "No transaction records fall in this window. This is a successful result, not a failure.",
    };
  }

  if (charges.length === 0) {
    return {
      ...shared,
      state: "empty",
      note: `All ${recordCount} record(s) in this window were excluded from fee attribution. The reasons are listed in full below.`,
    };
  }

  if (observedCount === 0) {
    return {
      ...shared,
      state: "unavailable",
      note: "No fee could be read for any transaction in this window, so no total is shown. The charges exist; this report could not observe them.",
    };
  }

  if (unknownCount > 0) {
    return {
      ...shared,
      state: "partial",
      note: `${observedCount} of ${charges.length} charges were observed. The totals cover only those; the remaining ${unknownCount} are counted but not valued.`,
    };
  }

  return {
    ...shared,
    state: "complete",
    note: `Every one of the ${charges.length} charges in this window was read from a receipt or from transaction metadata.`,
  };
}

/**
 * The sentence explaining why there is no single fiat figure.
 *
 * Returns null only when one figure is genuinely defensible: a single asset,
 * fully observed, with a price and the time it was true.
 */
export function fiatUnavailableReason(byNetwork: NetworkTotal[]): string | null {
  const assets = byNetwork.flatMap((network) => network.byAsset);

  if (assets.length === 0) return null;

  const distinctAssets = new Set(assets.map((asset) => `${asset.asset.network}:${asset.asset.kind}`));
  const unpriced = assets.filter((asset) => asset.fiat === null);

  if (unpriced.length === 0 && distinctAssets.size === 1) return null;

  if (unpriced.length > 0 && distinctAssets.size > 1) {
    return "Fees were charged in more than one asset, and at least one of them has no timestamped price. Per-asset totals are shown instead of a single figure.";
  }

  if (unpriced.length > 0) {
    const withUnknowns = unpriced.filter((asset) => asset.unknownCount > 0);

    return withUnknowns.length > 0
      ? "Some charges in this window could not be read, so converting the observed ones would produce a figure that looks like a complete total."
      : "No timestamped price was supplied for this fee asset, so no fiat figure is shown.";
  }

  return "Fees were charged in more than one asset. They are shown per asset rather than added together.";
}
