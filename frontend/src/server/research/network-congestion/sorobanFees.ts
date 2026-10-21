/**
 * Split a Soroban charge into inclusion and resource fees.
 *
 * Stellar's meta states the relation directly: the resource fee charged is
 * `totalNonRefundableResourceFeeCharged + totalRefundableResourceFeeCharged`,
 * and `feeCharged = resourceFeeCharged + inclusionFeeCharged`. Rent is already
 * inside the refundable component, so it is reported beside the resource fee
 * and never added a second time. Classic inclusion fees are not an input here.
 */

export type SorobanFeeSplit =
  | {
      ok: true;
      inclusionFeeStroops: bigint;
      resourceFeeStroops: bigint;
      rentStroops: bigint;
    }
  | {
      ok: false;
      reason: "negative_component" | "rent_exceeds_refundable" | "resource_exceeds_charged";
    };

export function splitSorobanFees(input: {
  feeChargedStroops: bigint;
  nonRefundableStroops: bigint;
  refundableStroops: bigint;
  rentStroops: bigint;
}): SorobanFeeSplit {
  const { feeChargedStroops, nonRefundableStroops, refundableStroops, rentStroops } = input;

  if (feeChargedStroops < 0n || nonRefundableStroops < 0n || refundableStroops < 0n || rentStroops < 0n) {
    return { ok: false, reason: "negative_component" };
  }

  if (rentStroops > refundableStroops) {
    return { ok: false, reason: "rent_exceeds_refundable" };
  }

  const resourceFeeStroops = nonRefundableStroops + refundableStroops;

  if (resourceFeeStroops > feeChargedStroops) {
    return { ok: false, reason: "resource_exceeds_charged" };
  }

  return {
    ok: true,
    inclusionFeeStroops: feeChargedStroops - resourceFeeStroops,
    resourceFeeStroops,
    rentStroops,
  };
}

/** A classic charge has no resource component. The whole fee is inclusion. */
export function classicInclusionFee(feeChargedStroops: bigint): { inclusionFeeStroops: bigint; resourceFeeStroops: null } | null {
  if (feeChargedStroops < 0n) return null;

  return { inclusionFeeStroops: feeChargedStroops, resourceFeeStroops: null };
}
