import type { OperationRequirement, ThresholdBand, ThresholdSet } from "./schema";

/** Classic Stellar operation → threshold band (protocol reference). */
export const CLASSIC_OPERATION_BANDS: { operation: string; band: ThresholdBand }[] = [
  { operation: "allow_trust", band: "low" },
  { operation: "bump_sequence", band: "low" },
  { operation: "set_trust_line_flags", band: "low" },
  { operation: "payment", band: "medium" },
  { operation: "path_payment_strict_receive", band: "medium" },
  { operation: "path_payment_strict_send", band: "medium" },
  { operation: "create_account", band: "medium" },
  { operation: "change_trust", band: "medium" },
  { operation: "manage_data", band: "medium" },
  { operation: "manage_sell_offer", band: "medium" },
  { operation: "manage_buy_offer", band: "medium" },
  { operation: "create_passive_sell_offer", band: "medium" },
  { operation: "create_claimable_balance", band: "medium" },
  { operation: "claim_claimable_balance", band: "medium" },
  { operation: "begin_sponsoring_future_reserves", band: "medium" },
  { operation: "end_sponsoring_future_reserves", band: "medium" },
  { operation: "clawback", band: "medium" },
  { operation: "clawback_claimable_balance", band: "medium" },
  { operation: "liquidity_pool_deposit", band: "medium" },
  { operation: "liquidity_pool_withdraw", band: "medium" },
  { operation: "set_options", band: "high" },
  { operation: "account_merge", band: "high" },
];

export function requiredWeight(thresholds: ThresholdSet, band: ThresholdBand): number {
  if (band === "low") return thresholds.low;
  if (band === "medium") return thresholds.medium;
  return thresholds.high;
}

/**
 * Reachability means the observed signer weights can sum to the threshold.
 * It does NOT mean any private key is possessed or that a signature was checked.
 */
export function buildOperationMatrix(thresholds: ThresholdSet, totalWeight: number): OperationRequirement[] {
  return CLASSIC_OPERATION_BANDS.map(({ operation, band }) => {
    const required = requiredWeight(thresholds, band);
    const reachable = totalWeight >= required;
    return {
      operation,
      band,
      requiredWeight: required,
      reachable,
      note: reachable
        ? `Observed signer weights (${totalWeight}) meet the ${band} threshold (${required}). This does not prove key possession.`
        : `Observed signer weights (${totalWeight}) are below the ${band} threshold (${required}).`,
    };
  });
}

export function sumSignerWeights(weights: number[]): number {
  return weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
}
