import { formatUsd, shareBps } from "./decimalMath";
import type { AssetAttributionRow } from "./assetAttribution";
import type { ChainContribution } from "./schema";

/**
 * Rolls the asset attribution up by chain. A chain holding one asset that
 * could not be attributed is reported as partial, with the figures it can
 * still state, rather than as a total that silently omits that asset.
 */
export function attributeChains(rows: AssetAttributionRow[], market: bigint | null): ChainContribution[] {
  const chains = [...new Set(rows.map((row) => row.chain))].sort();

  return chains.map((chain) => {
    const own = rows.filter((row) => row.chain === chain);
    const flow = own.reduce((total, row) => total + row.flow, 0n);
    const complete = own.every((row) => row.market !== null);
    const split = own.every((row) => row.priceEffect !== null && row.residual !== null);
    const chainMarket = complete ? own.reduce((total, row) => total + (row.market as bigint), 0n) : null;

    return {
      chain,
      externalFlowUsd: formatUsd(flow),
      marketUsd: chainMarket === null ? null : formatUsd(chainMarket),
      priceEffectUsd: split ? formatUsd(own.reduce((total, row) => total + (row.priceEffect as bigint), 0n)) : null,
      residualUsd: split && complete ? formatUsd(own.reduce((total, row) => total + (row.residual as bigint), 0n)) : null,
      marketShareBps: chainMarket === null || market === null ? null : shareBps(chainMarket, market),
      state: complete && split ? "complete" : "partial",
    };
  });
}
