import type { ReserveBreakdown, ReserveCounters } from "./schema";
import { validateCounters } from "./sponsorship";

export function calculateReserveBreakdown(input: {
  balanceStroops: bigint;
  sellingLiabilitiesStroops: bigint;
  feeAllowanceStroops: bigint;
  baseReserveStroops: bigint;
  counters: ReserveCounters;
}): ReserveBreakdown {
  const counters = validateCounters(input.counters);
  if (input.baseReserveStroops <= 0n) throw new Error("Base reserve must be positive");
  const baseAccountReserve = 2n * input.baseReserveStroops;
  const subentryReserve = BigInt(counters.subentryCount) * input.baseReserveStroops;
  const sponsoringReserve = BigInt(counters.numSponsoring) * input.baseReserveStroops;
  const sponsoredCredit = BigInt(counters.numSponsored) * input.baseReserveStroops;
  const minimumReserve = baseAccountReserve + subentryReserve + sponsoringReserve - sponsoredCredit;
  const required = minimumReserve + input.sellingLiabilitiesStroops + input.feeAllowanceStroops;
  const spendable = input.balanceStroops > required ? input.balanceStroops - required : 0n;
  const shortfall = required > input.balanceStroops ? required - input.balanceStroops : 0n;
  const reconciliation = input.balanceStroops - (minimumReserve + input.sellingLiabilitiesStroops + input.feeAllowanceStroops + spendable) + shortfall;
  return {
    balanceStroops: input.balanceStroops.toString(),
    baseAccountReserveStroops: baseAccountReserve.toString(),
    subentryReserveStroops: subentryReserve.toString(),
    sponsoringReserveStroops: sponsoringReserve.toString(),
    sponsoredReserveCreditStroops: sponsoredCredit.toString(),
    minimumReserveStroops: minimumReserve.toString(),
    sellingLiabilitiesStroops: input.sellingLiabilitiesStroops.toString(),
    feeAllowanceStroops: input.feeAllowanceStroops.toString(),
    spendableStroops: spendable.toString(),
    shortfallStroops: shortfall.toString(),
    reconciliationStroops: reconciliation.toString(),
  };
}
