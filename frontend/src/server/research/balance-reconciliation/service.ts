import { assetKey } from "./assetIdentity";
import { coverageNotice } from "./coverage";
import { BalanceReconciliationError, type ReconciliationState } from "./errors";
import { classifyEffects, type RawEffect } from "./effectClassifier";
import { readAccountHistory, type HistoryRead, type ReadOutcome } from "./effectReader";
import { attributeFees, type FeeTransaction } from "./feeAttribution";
import type { StellarNetwork } from "./networkIdentity";
import { claimMatch, reconcileAssets } from "./reconcile";
import { applyRunningBalance, decimalToStroops } from "./runningBalance";
import { BALANCE_SCHEMA_VERSION, balanceRequestSchema, type BalanceCategory, type BalanceReport, type CategoryTotal } from "./schema";

export type BalanceDeps = {
  readHistory: (network: StellarNetwork, account: string, fromLedger: number, toLedger: number) => Promise<ReadOutcome<HistoryRead>>;
};

const productionDeps: BalanceDeps = {
  readHistory: async (network, account) => readAccountHistory(network, account),
};

function balanceMap(entries: Record<string, string> | null): Map<string, bigint> | null {
  if (!entries) return null;
  const map = new Map<string, bigint>();
  for (const [key, value] of Object.entries(entries)) {
    map.set(key === "native" ? "native" : assetKey({ asset: key }), decimalToStroops(value));
  }
  return map;
}

function unavailableReport(account: string, network: StellarNetwork, fromLedger: number, toLedger: number, reason: string): BalanceReport {
  return {
    schemaVersion: BALANCE_SCHEMA_VERSION,
    account,
    network,
    fromLedger,
    toLedger,
    state: "unavailable",
    matched: false,
    timeline: [],
    categories: [],
    reconciliation: [],
    unclassified: [],
    historyTruncated: false,
    oldestLedger: null,
    coverageNotice: `${coverageNotice("unavailable", false, null)} ${reason}`,
    readOnly: true,
    pricesConverted: false,
  };
}

/**
 * Rebuild per-asset balances from effects and fees, then compare them with the recorded end balances.
 * Missing history is partial. It is never reported as a match.
 */
export async function reconcileBalances(input: unknown, deps: BalanceDeps = productionDeps): Promise<BalanceReport> {
  const parsed = balanceRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new BalanceReconciliationError("invalid_request", "The reconciliation request is invalid.", parsed.error.flatten());
  }
  const { account, network, fromLedger, toLedger } = parsed.data;
  const history = await deps.readHistory(network, account, fromLedger, toLedger);
  if (history.status === "unavailable") return unavailableReport(account, network, fromLedger, toLedger, history.reason);
  if (history.status === "missing") {
    throw new BalanceReconciliationError("not_found", "No account was recorded for this id on the selected network.");
  }

  const inWindow = (ledger: number) => ledger >= fromLedger && ledger <= toLedger;
  const seen = new Set<string>();
  const effects = history.value.effects.filter((effect) => {
    const token = effect.pagingToken || effect.id;
    if (seen.has(token) || !inWindow(effect.ledger)) return false;
    seen.add(token);
    return true;
  });
  const transactions = history.value.transactions.filter((transaction) => inWindow(transaction.ledger));
  const classified = classifyEffects(effects);
  const fees = attributeFees(transactions, account);
  const ordered = [
    ...classified.movements.map((movement) => ({ ...movement, paging: movement.id })),
    ...fees.map((fee) => ({ id: fee.id, ledger: fee.ledger, category: fee.category, asset: fee.asset, stroops: fee.stroops })),
  ].sort((left, right) => left.ledger - right.ledger || left.id.localeCompare(right.id));

  const opening = balanceMap(history.value.opening) ?? new Map<string, bigint>();
  const recorded = balanceMap(history.value.closing);
  const running = new Map(opening);
  const timeline = ordered.map((movement) => {
    const next = (running.get(movement.asset) ?? 0n) + movement.stroops;
    running.set(movement.asset, next);
    return {
      ledger: movement.ledger,
      category: movement.category,
      asset: movement.asset,
      stroops: movement.stroops.toString(),
      runningStroops: next.toString(),
    };
  });
  const reconstructed = applyRunningBalance(opening, ordered);
  const reconciliation = reconcileAssets(reconstructed, recorded, opening);
  const totals = new Map<string, bigint>();
  for (const movement of ordered) {
    const key = `${movement.category}:${movement.asset}`;
    totals.set(key, (totals.get(key) ?? 0n) + movement.stroops);
  }
  const categories: CategoryTotal[] = [...totals.entries()].map(([key, stroops]) => {
    const separator = key.indexOf(":");
    return {
      category: key.slice(0, separator) as BalanceCategory,
      asset: key.slice(separator + 1),
      stroops: stroops.toString(),
    };
  });

  const reasons: string[] = [];
  if (history.value.truncated) reasons.push("Effect history was truncated.");
  if (!history.value.closing || !history.value.opening) reasons.push("A recorded opening or end balance was not available.");
  if (classified.unclassified.length > 0) reasons.push("Some effects had no classification and were left out of the sum.");
  const matched = claimMatch(reconciliation, reasons.length > 0, classified.unclassified.length);
  const state: ReconciliationState = reasons.length > 0 ? "partial" : "complete";

  return {
    schemaVersion: BALANCE_SCHEMA_VERSION,
    account,
    network,
    fromLedger,
    toLedger,
    state,
    matched,
    timeline,
    categories,
    reconciliation,
    unclassified: classified.unclassified,
    historyTruncated: history.value.truncated,
    oldestLedger: history.value.oldestLedger,
    coverageNotice: coverageNotice(state, matched, history.value.oldestLedger),
    readOnly: true,
    pricesConverted: false,
  };
}

export type { FeeTransaction, RawEffect };
