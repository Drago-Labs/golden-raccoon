/**
 * Coverage notes and timeline aggregation for vesting unlocks.
 */
import type { TimelineBucket, UnlockTranche, VestingAsset, VestingCoverage, EvidenceGap } from "./schema";
import { toEpochMs } from "./time";
import { sumBaseUnits } from "./unitMath";

function emptyAssetBucket(asset: VestingAsset) {
  return {
    asset,
    scheduledBaseUnits: "0",
    releasedBaseUnits: "0",
    claimableBaseUnits: "0",
    cancelledBaseUnits: "0",
  };
}

export function buildTimeline(tranches: UnlockTranche[]): TimelineBucket[] {
  const buckets = new Map<string, TimelineBucket>();

  for (const tranche of tranches) {
    const ms = toEpochMs(tranche.unlockAt);
    const day = ms === null ? "unknown" : new Date(ms).toISOString().slice(0, 10);
    const startsAt = day === "unknown" ? "unknown" : `${day}T00:00:00.000Z`;
    let bucket = buckets.get(startsAt);

    if (!bucket) {
      bucket = { startsAt, trancheCount: 0, byAsset: [] };
      buckets.set(startsAt, bucket);
    }

    bucket.trancheCount += 1;

    const assetKey = tranche.asset.identity;
    let assetBucket = bucket.byAsset.find((entry) => entry.asset.identity === assetKey);

    if (!assetBucket) {
      assetBucket = emptyAssetBucket(tranche.asset);
      bucket.byAsset.push(assetBucket);
    }

    if (tranche.state === "scheduled") {
      assetBucket.scheduledBaseUnits = sumBaseUnits([assetBucket.scheduledBaseUnits, tranche.amountBaseUnits]);
    } else if (tranche.state === "released") {
      assetBucket.releasedBaseUnits = sumBaseUnits([assetBucket.releasedBaseUnits, tranche.amountBaseUnits]);
    } else if (tranche.state === "claimable") {
      assetBucket.claimableBaseUnits = sumBaseUnits([assetBucket.claimableBaseUnits, tranche.amountBaseUnits]);
    } else if (tranche.state === "cancelled") {
      assetBucket.cancelledBaseUnits = sumBaseUnits([assetBucket.cancelledBaseUnits, tranche.amountBaseUnits]);
    }
  }

  return [...buckets.values()].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

export function buildCoverage(options: {
  sourceCount: number;
  tranches: UnlockTranche[];
  gaps: EvidenceGap[];
  readsUsed: number;
  readBudget: number;
  staleObservation: boolean;
}): VestingCoverage {
  const { sourceCount, tranches, gaps, readsUsed, readBudget, staleObservation } = options;

  const future = tranches.filter((tranche) => tranche.state === "scheduled" || tranche.state === "claimable");
  const cancelledFuture = tranches.filter((tranche) => tranche.state === "cancelled");

  const countedFutureBaseUnits = sumBaseUnits(future.map((tranche) => tranche.amountBaseUnits));
  const cancelledFutureBaseUnits = sumBaseUnits(cancelledFuture.map((tranche) => tranche.amountBaseUnits));

  if (sourceCount === 0 && tranches.length === 0) {
    return {
      state: "empty",
      note: "No vesting sources were supplied.",
      sourceCount,
      trancheCount: 0,
      countedFutureBaseUnits,
      cancelledFutureBaseUnits,
      gapCount: gaps.length,
      readsUsed,
      readBudget,
      staleObservation,
    };
  }

  if (tranches.length === 0 && gaps.length > 0) {
    return {
      state: "unavailable",
      note: "Sources were read but no supported unlock evidence could be normalized.",
      sourceCount,
      trancheCount: 0,
      countedFutureBaseUnits,
      cancelledFutureBaseUnits,
      gapCount: gaps.length,
      readsUsed,
      readBudget,
      staleObservation,
    };
  }

  const unknownCount = tranches.filter((tranche) => tranche.state === "unknown").length;
  const partial = gaps.length > 0 || unknownCount > 0 || staleObservation || readsUsed >= readBudget;

  return {
    state: partial ? "partial" : tranches.length === 0 ? "empty" : "complete",
    note: partial
      ? "Some unlock evidence is incomplete, stale, or unsupported; totals cover only counted non-cancelled unlocks."
      : "Every supplied source produced dated unlock evidence within the read budget.",
    sourceCount,
    trancheCount: tranches.length,
    countedFutureBaseUnits,
    cancelledFutureBaseUnits,
    gapCount: gaps.length,
    readsUsed,
    readBudget,
    staleObservation,
  };
}
