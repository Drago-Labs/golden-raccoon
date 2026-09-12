import { canonicalAssetIdentity } from "@/server/snapshots/canonical";
import type { RiskSnapshotAsset } from "@/server/snapshots/schema";
import { ComparisonValidationError } from "./schema";

export type VerifiedIdentity = {
  canonicalIdentity: string;
  network: string;
  chainFamily: string;
  symbol: string;
};

/**
 * Asserts that two snapshot assets share the exact same canonical asset identity
 * and deployment network. Rejects cross-asset and cross-network pairs with typed
 * comparison validation errors.
 *
 * @param baseAsset - The baseline snapshot asset identity structure.
 * @param targetAsset - The target snapshot asset identity structure to compare against.
 * @returns Verified canonical identity strings and metadata.
 */
export function assertComparableIdentity(
  baseAsset: RiskSnapshotAsset,
  targetAsset: RiskSnapshotAsset,
): VerifiedIdentity {
  const baseFamily = baseAsset.chainFamily;
  const targetFamily = targetAsset.chainFamily;
  if (baseFamily !== targetFamily) {
    throw new ComparisonValidationError(
      "cross_network",
      `Snapshots originate from different chain families (${baseFamily} vs ${targetFamily}).`,
      { baseFamily, targetFamily },
    );
  }

  const baseNetwork = baseAsset.network.trim().toLowerCase();
  const targetNetwork = targetAsset.network.trim().toLowerCase();
  if (baseNetwork !== targetNetwork) {
    throw new ComparisonValidationError(
      "cross_network",
      `Snapshots originate from different networks (${baseAsset.network} vs ${targetAsset.network}).`,
      { baseNetwork: baseAsset.network, targetNetwork: targetAsset.network },
    );
  }

  const baseIdentity = canonicalAssetIdentity(baseAsset);
  const targetIdentity = canonicalAssetIdentity(targetAsset);

  if (baseIdentity !== targetIdentity) {
    throw new ComparisonValidationError(
      "cross_asset",
      `Snapshots represent different canonical assets (${baseAsset.symbol} vs ${targetAsset.symbol}).`,
      { baseIdentity, targetIdentity, baseSymbol: baseAsset.symbol, targetSymbol: targetAsset.symbol },
    );
  }

  return {
    canonicalIdentity: baseIdentity,
    network: baseAsset.network,
    chainFamily: baseFamily,
    symbol: baseAsset.symbol,
  };
}
