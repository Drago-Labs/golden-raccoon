/**
 * Supply sitting in account trustlines, liquidity pools, and claimable balances.
 *
 * The three buckets are summed from the records this read actually saw. They
 * are not copied from the asset's headline totals, and pool or claimable
 * supply is never folded into a trustline holder.
 */
import { exactRatio, formatBaseUnits, parseBaseUnits } from "./concentration";
import type { NamedAmount, SupplyBucket, SupplyBucketId } from "./schema";

const BUCKET_LABELS: Record<SupplyBucketId, string> = {
  trustlines: "Account trustlines",
  liquidity_pools: "Liquidity pools",
  claimable_balances: "Claimable balances",
};

export type SupplyBucketResult = {
  buckets: SupplyBucket[];
  pools: NamedAmount[];
  claimables: NamedAmount[];
  trustlineBaseUnits: bigint;
  observedBaseUnits: bigint;
  issuedBaseUnits: bigint;
  contractsBaseUnits: bigint;
};

export function buildSupplyBuckets(input: {
  holderBalances: readonly string[];
  pools: readonly { id: string; amount: string }[];
  claimables: readonly { id: string; amount: string }[];
  issued: string;
  contracts: string;
}): SupplyBucketResult {
  const trustlineBaseUnits = input.holderBalances.reduce((sum, balance) => sum + parseBaseUnits(balance), 0n);
  const pools = input.pools.map((pool) => namedAmount(pool.id, pool.amount));
  const claimables = input.claimables.map((claimable) => namedAmount(claimable.id, claimable.amount));
  const poolBaseUnits = pools.reduce((sum, pool) => sum + BigInt(pool.baseUnits), 0n);
  const claimableBaseUnits = claimables.reduce((sum, claimable) => sum + BigInt(claimable.baseUnits), 0n);
  const issuedBaseUnits = parseBaseUnits(input.issued);
  const contractsBaseUnits = parseBaseUnits(input.contracts);
  const observedBaseUnits = trustlineBaseUnits + poolBaseUnits + claimableBaseUnits;

  return {
    buckets: [
      bucket("trustlines", trustlineBaseUnits, issuedBaseUnits),
      bucket("liquidity_pools", poolBaseUnits, issuedBaseUnits),
      bucket("claimable_balances", claimableBaseUnits, issuedBaseUnits),
    ],
    pools,
    claimables,
    trustlineBaseUnits,
    observedBaseUnits,
    issuedBaseUnits,
    contractsBaseUnits,
  };
}

function namedAmount(id: string, amount: string): NamedAmount {
  const baseUnits = parseBaseUnits(amount);

  return { id, amount: formatBaseUnits(baseUnits), baseUnits: baseUnits.toString() };
}

function bucket(id: SupplyBucketId, baseUnits: bigint, issuedBaseUnits: bigint): SupplyBucket {
  return {
    id,
    label: BUCKET_LABELS[id],
    baseUnits: baseUnits.toString(),
    amount: formatBaseUnits(baseUnits),
    shareOfIssued: exactRatio(baseUnits, issuedBaseUnits),
  };
}
