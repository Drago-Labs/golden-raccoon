/**
 * Inclusion-fee percentiles for one ledger window.
 *
 * The rank is an integer nearest-rank:
 * `rank = ceil(percentile / 100 * n) = (percentile * n + 99) / 100`,
 * using integer division, and the value is the sample at `rank - 1` after
 * sorting ascending. One sample is one included transaction. Classic and
 * Soroban inclusion samples are the fee per operation (floor division).
 * Soroban resource samples are the resource-fee total, not divided, and not
 * added to either inclusion series.
 */
import type { FeeDistribution, FeeSummary, ObservedLedger, SorobanResourceDistribution } from "./schema";

export function inclusionFeePerOperation(totalStroops: string, operationCount: number): bigint | null {
  if (!/^\d+$/.test(totalStroops) || totalStroops.length > 20) return null;
  if (!Number.isInteger(operationCount) || operationCount < 1) return null;

  return BigInt(totalStroops) / BigInt(operationCount);
}

/** `percentile` is 50, 90, or 99. `sorted` must already be ascending. */
export function nearestRankPercentile(sorted: readonly bigint[], percentile: 50 | 90 | 99): bigint | null {
  const count = BigInt(sorted.length);

  if (count === 0n) return null;

  const rank = (BigInt(percentile) * count + 99n) / 100n;
  const index = Number(rank - 1n);

  return sorted[index] ?? null;
}

function compareStroops(left: bigint, right: bigint): number {
  if (left < right) return -1;
  if (left > right) return 1;

  return 0;
}

function emptyDistribution(unit: FeeDistribution["unit"]): FeeDistribution {
  return { unit, sampleCount: 0, p50: null, p90: null, p99: null, min: null, max: null };
}

function distribution(samples: bigint[], unit: FeeDistribution["unit"]): FeeDistribution {
  if (samples.length === 0) return emptyDistribution(unit);

  const sorted = [...samples].sort(compareStroops);
  const p50 = nearestRankPercentile(sorted, 50);
  const p90 = nearestRankPercentile(sorted, 90);
  const p99 = nearestRankPercentile(sorted, 99);

  return {
    unit,
    sampleCount: sorted.length,
    p50: p50 === null ? null : p50.toString(),
    p90: p90 === null ? null : p90.toString(),
    p99: p99 === null ? null : p99.toString(),
    min: sorted[0].toString(),
    max: sorted[sorted.length - 1].toString(),
  };
}

export function summarizeFees(ledgers: readonly ObservedLedger[]): FeeSummary {
  const classic: bigint[] = [];
  const sorobanInclusion: bigint[] = [];
  const sorobanResource: bigint[] = [];
  let rent = 0n;

  for (const ledger of ledgers) {
    for (const transaction of ledger.transactions) {
      if (transaction.split === "classic" && transaction.classicInclusionFeeStroops !== null) {
        const perOperation = inclusionFeePerOperation(transaction.classicInclusionFeeStroops, transaction.operationCount);

        if (perOperation !== null) classic.push(perOperation);
      }

      if (transaction.split !== "soroban") continue;

      if (transaction.sorobanInclusionFeeStroops !== null) {
        const perOperation = inclusionFeePerOperation(transaction.sorobanInclusionFeeStroops, transaction.operationCount);

        if (perOperation !== null) sorobanInclusion.push(perOperation);
      }

      if (transaction.sorobanResourceFeeStroops !== null && /^\d+$/.test(transaction.sorobanResourceFeeStroops)) {
        sorobanResource.push(BigInt(transaction.sorobanResourceFeeStroops));

        if (transaction.sorobanRentFeeStroops !== null && /^\d+$/.test(transaction.sorobanRentFeeStroops)) {
          rent += BigInt(transaction.sorobanRentFeeStroops);
        }
      }
    }
  }

  const resource: SorobanResourceDistribution = {
    ...distribution(sorobanResource, "stroops"),
    rentStroopsIncluded: rent.toString(),
  };

  return {
    classicInclusion: distribution(classic, "stroops_per_operation"),
    sorobanInclusion: distribution(sorobanInclusion, "stroops_per_operation"),
    sorobanResource: resource,
  };
}
