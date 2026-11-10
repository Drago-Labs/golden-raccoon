import type { BlendNetwork } from "./networkIdentity";
import type { OraclePriceEntry } from "./schema";

export interface OraclePriceProvider {
  readOraclePrices(input: {
    poolId: string;
    assetIds: string[];
    network: BlendNetwork;
  }): Promise<OraclePriceEntry[]>;
}

export function createDefaultOraclePriceReader(): OraclePriceProvider {
  return {
    async readOraclePrices({ assetIds }) {
      return assetIds.map((assetId) => ({ assetId, priceUsd: null, oracleLedger: null }));
    },
  };
}

export function findMissingOracleAssets(
  activeAssetIds: string[],
  oracleEntries: OraclePriceEntry[],
): { priceByAsset: Map<string, number>; missingAssets: string[] } {
  const priceByAsset = new Map<string, number>();
  for (const entry of oracleEntries) {
    if (entry.priceUsd !== null && Number.isFinite(entry.priceUsd) && entry.priceUsd > 0) {
      priceByAsset.set(entry.assetId, entry.priceUsd);
    }
  }
  const missingAssets: string[] = [];
  for (const assetId of activeAssetIds) {
    if (!priceByAsset.has(assetId)) {
      missingAssets.push(assetId);
    }
  }
  return { priceByAsset, missingAssets };
}
