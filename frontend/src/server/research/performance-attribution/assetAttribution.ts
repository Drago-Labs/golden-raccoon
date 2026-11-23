import { formatUsd, quantityTimesPrice, shareBps } from "./decimalMath";
import type { PortfolioObservation, AssetContribution } from "./schema";

export type AssetAttributionRow = {
  key: string;
  symbol: string;
  chain: string;
  startValue: bigint | null;
  endValue: bigint | null;
  change: bigint | null;
  flow: bigint;
  market: bigint | null;
  priceEffect: bigint | null;
  residual: bigint | null;
  notes: string[];
};

/**
 * Attributes a period's change in value to each asset.
 *
 *   change        = end value − start value
 *   market        = change − external flows          (flows are never a return)
 *   price effect  = start quantity × (end price − start price)
 *   residual      = market − price effect            (movement on units acquired
 *                                                     or released mid-period,
 *                                                     plus the truncated remainder)
 *
 * Because the residual is defined as the rest of the market movement, an
 * asset's flow, price effect and residual always add back to its observed
 * change exactly — no rounding is hidden.
 *
 * An asset without a usable price on either side keeps a null value and is
 * reported as partial rather than being treated as worth zero.
 */
export function attributeAssets(
  start: PortfolioObservation | null,
  end: PortfolioObservation | null,
  flowsByAsset: Map<string, bigint>,
): AssetAttributionRow[] {
  const startByKey = new Map((start?.holdings ?? []).map((holding) => [holding.key, holding]));
  const endByKey = new Map((end?.holdings ?? []).map((holding) => [holding.key, holding]));
  const held = [...new Set([...startByKey.keys(), ...endByKey.keys()])].sort();

  // The transfer history names assets by chain and symbol while a snapshot
  // names them by chain and contract identity, so a flow is matched to the
  // holding it belongs to by either name. A flow whose asset is in neither
  // bounding observation keeps its own row rather than being dropped.
  const consumed = new Set<string>();
  const flowFor = (holding: { key: string; alias: string } | undefined, key: string): bigint => {
    for (const candidate of [key, holding?.key, holding?.alias]) {
      if (candidate && flowsByAsset.has(candidate) && !consumed.has(candidate)) {
        consumed.add(candidate);
        return flowsByAsset.get(candidate) as bigint;
      }
    }
    return 0n;
  };

  const rows = held.map((key) => {
    const before = startByKey.get(key);
    const after = endByKey.get(key);
    const notes: string[] = [];

    const startValue = before ? before.valueUsdUnits : start ? 0n : null;
    const endValue = after ? after.valueUsdUnits : end ? 0n : null;
    if (before && before.valueUsdUnits === null) notes.push("No usable price at the start of the period.");
    if (after && after.valueUsdUnits === null) notes.push("No usable price at the end of the period.");
    if (!start) notes.push("No observation at the start of the period.");
    if (!end) notes.push("No observation at the end of the period.");

    const change = startValue === null || endValue === null ? null : endValue - startValue;
    const flow = flowFor(after ?? before, key);
    const market = change === null ? null : change - flow;

    const priceEffect =
      before && before.priceUsdUnits !== null && after && after.priceUsdUnits !== null
        ? quantityTimesPrice(before.quantityUnits, after.priceUsdUnits - before.priceUsdUnits)
        : before === undefined && start !== null
          ? 0n // Not held at the start: there is no price effect to attribute.
          : null;
    if (priceEffect === null && change !== null) {
      notes.push("A price is missing on one side, so the market movement is not split into price effect and residual.");
    }
    const residual = market === null || priceEffect === null ? null : market - priceEffect;

    return { key, symbol: after?.symbol ?? before?.symbol ?? key, chain: after?.chain ?? before?.chain ?? "unknown", startValue, endValue, change, flow, market, priceEffect, residual, notes };
  });

  const unmatched = [...flowsByAsset.keys()]
    .filter((key) => !consumed.has(key))
    .sort()
    .map((key) => {
      const flow = flowsByAsset.get(key) as bigint;
      const [chain, symbol] = key.includes(":") ? [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)] : [key, key];
      return {
        key,
        symbol,
        chain,
        startValue: 0n,
        endValue: 0n,
        change: 0n,
        flow,
        market: -flow,
        priceEffect: 0n,
        residual: -flow,
        notes: [
          "This asset is in no bounding observation, so its flow is reported against a zero value: the market figure here is only the flow being reversed out, not an observed loss.",
        ],
      };
    });

  return [...rows, ...unmatched];
}

/** The period's market movement: the sum of the assets that could be attributed, or null when any could not. */
export function marketTotal(rows: AssetAttributionRow[]): bigint | null {
  let total = 0n;
  for (const row of rows) {
    if (row.market === null) return null;
    total += row.market;
  }
  return total;
}

export function formatAssetContributions(rows: AssetAttributionRow[], market: bigint | null): AssetContribution[] {
  return rows.map((row) => ({
    key: row.key,
    symbol: row.symbol,
    chain: row.chain,
    startValueUsd: row.startValue === null ? null : formatUsd(row.startValue),
    endValueUsd: row.endValue === null ? null : formatUsd(row.endValue),
    changeUsd: row.change === null ? null : formatUsd(row.change),
    externalFlowUsd: formatUsd(row.flow),
    marketUsd: row.market === null ? null : formatUsd(row.market),
    priceEffectUsd: row.priceEffect === null ? null : formatUsd(row.priceEffect),
    residualUsd: row.residual === null ? null : formatUsd(row.residual),
    marketShareBps: row.market === null || market === null ? null : shareBps(row.market, market),
    state: row.market === null || row.priceEffect === null ? "partial" : "complete",
    notes: row.notes,
  }));
}
