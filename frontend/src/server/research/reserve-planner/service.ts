import type { StellarAccountDataAdapter } from "@/server/stellar/horizonAdapter";
import { readReserveAccount } from "./accountReader";
import { readLedgerParameters, type LedgerParameterReader } from "./ledgerParameters";
import { validateLiabilities } from "./liabilities";
import { calculateReserveBreakdown } from "./reserveMath";
import { applyScenario } from "./scenarios";
import type { ReservePlannerRequest, ReservePlannerResult } from "./schema";

export type ReservePlannerDependencies = { accountAdapter?: StellarAccountDataAdapter; ledgerReader?: LedgerParameterReader; now?: () => Date };

export async function buildReservePlan(
  request: ReservePlannerRequest & { walletAddress: string },
  dependencies: ReservePlannerDependencies = {},
): Promise<ReservePlannerResult> {
  const now = dependencies.now?.() ?? new Date();
  const unavailable = (warning: string): ReservePlannerResult => ({
    walletAddress: request.walletAddress,
    network: request.network,
    state: "unavailable",
    generatedAt: now.toISOString(),
    observation: { ledger: null, source: null, checkedAt: now.toISOString(), consistent: false },
    baseReserveStroops: null, beforeCounters: null, afterCounters: null, before: null, after: null,
    scenario: request.scenario, warnings: [warning], unsupportedEntryTypes: [],
  });

  let account;
  try {
    account = await readReserveAccount(request.walletAddress, request.network, dependencies.accountAdapter);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "Reserve account unavailable");
  }
  const observedUnavailable = (warning: string): ReservePlannerResult => ({
    ...unavailable(warning),
    observation: { ledger: account.lastModifiedLedger, source: account.source, checkedAt: account.checkedAt, consistent: false },
    beforeCounters: account.counters,
    unsupportedEntryTypes: account.unsupportedEntryTypes,
  });
  if (account.accountId !== request.walletAddress) return observedUnavailable("Provider returned an account for a different wallet or network");
  let ledger;
  try {
    ledger = await (dependencies.ledgerReader ?? readLedgerParameters)(account.lastModifiedLedger, request.network);
  } catch (error) {
    return observedUnavailable(error instanceof Error ? error.message : "Ledger parameters unavailable");
  }
  if (ledger.ledger !== account.lastModifiedLedger) return observedUnavailable("Account and ledger parameters were observed at different ledgers");
  try {
    validateLiabilities(account.balanceStroops, account.sellingLiabilitiesStroops);
    let afterCounters;
    try {
      afterCounters = applyScenario(account.counters, request.scenario);
    } catch (error) {
      return {
        ...unavailable(error instanceof Error ? error.message : "Impossible scenario counters"),
        observation: { ledger: account.lastModifiedLedger, source: account.source, checkedAt: account.checkedAt, consistent: true },
        baseReserveStroops: ledger.baseReserveStroops.toString(), beforeCounters: account.counters,
      };
    }
    const shared = { balanceStroops: account.balanceStroops, sellingLiabilitiesStroops: account.sellingLiabilitiesStroops, feeAllowanceStroops: request.feeAllowanceStroops, baseReserveStroops: ledger.baseReserveStroops };
    const before = calculateReserveBreakdown({ ...shared, counters: account.counters });
    const after = calculateReserveBreakdown({ ...shared, counters: afterCounters });
    const warnings = account.unsupportedEntryTypes.length ? [`Unsupported ledger-entry types (${account.unsupportedEntryTypes.join(", ")}) were observed; reserve release estimates are incomplete`] : [];
    if (before.shortfallStroops !== "0") warnings.push("Current obligations exceed the observed XLM balance");
    return {
      walletAddress: request.walletAddress, network: request.network,
      state: warnings.length ? "partial" : "complete", generatedAt: now.toISOString(),
      observation: { ledger: account.lastModifiedLedger, source: account.source === ledger.source ? account.source : `${account.source}; ${ledger.source}`, checkedAt: account.checkedAt, consistent: true },
      baseReserveStroops: ledger.baseReserveStroops.toString(), beforeCounters: account.counters, afterCounters,
      before, after, scenario: request.scenario, warnings, unsupportedEntryTypes: account.unsupportedEntryTypes,
    };
  } catch (error) {
    return observedUnavailable(error instanceof Error ? error.message : "Reserve data unavailable");
  }
}
