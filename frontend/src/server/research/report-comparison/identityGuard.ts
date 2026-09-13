/**
 * Guards that both snapshots describe the same asset on the same network.
 *
 * The canonical identity is rebuilt here from the snapshot's own asset record
 * rather than trusted from storage, and the chain family and network are part
 * of the key, so `USDC` on pubnet never compares against `USDC` on testnet.
 */
import { canonicalAssetIdentity } from "@/server/snapshots/canonical";
import type { PublicRiskSnapshot } from "@/server/snapshots/schema";
import { ComparisonError, type ComparisonAsset } from "./schema";

export function describeAsset(snapshot: PublicRiskSnapshot): ComparisonAsset {
  const asset = snapshot.document.asset;

  return {
    chainFamily: asset.chainFamily,
    network: asset.network,
    symbol: asset.symbol,
    identityKind: asset.identity.kind,
    canonicalId: asset.identity.canonicalId,
    identityKey: `${asset.chainFamily}|${asset.network}|${canonicalAssetIdentity(asset)}`,
  };
}

/**
 * Throws when the two snapshots are not about the same thing. Cross-network is
 * reported separately from cross-asset because the two need different
 * explanations in the UI.
 */
export function assertSameSubject(left: PublicRiskSnapshot, right: PublicRiskSnapshot): ComparisonAsset {
  const leftAsset = describeAsset(left);
  const rightAsset = describeAsset(right);

  if (leftAsset.chainFamily !== rightAsset.chainFamily || leftAsset.network !== rightAsset.network) {
    throw new ComparisonError(
      "cross_network",
      `These snapshots were taken on different networks (${leftAsset.chainFamily}/${leftAsset.network} and ${rightAsset.chainFamily}/${rightAsset.network}). Comparing them would imply a change that never happened.`,
    );
  }

  if (leftAsset.identityKey !== rightAsset.identityKey) {
    throw new ComparisonError(
      "cross_asset",
      `These snapshots describe different assets (${leftAsset.canonicalId} and ${rightAsset.canonicalId}).`,
    );
  }

  return leftAsset;
}
