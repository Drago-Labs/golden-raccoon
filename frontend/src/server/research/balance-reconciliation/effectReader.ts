import { BalanceReconciliationError } from "./errors";
import type { RawEffect } from "./effectClassifier";
import type { FeeTransaction } from "./feeAttribution";
import { BALANCE_LIMITS } from "./limits";
import { horizonBase, type StellarNetwork } from "./networkIdentity";

export type HistoryRead = {
  effects: RawEffect[];
  transactions: FeeTransaction[];
  opening: Record<string, string> | null;
  closing: Record<string, string> | null;
  truncated: boolean;
  oldestLedger: number | null;
};

export type ReadOutcome<T> = { status: "ok"; value: T } | { status: "missing" } | { status: "unavailable"; reason: string };

type Paging = { pageSize: number; maxPages: number; maxEffects: number };

export function effectsUrl(network: StellarNetwork, account: string, cursor: string | null, pageSize: number = BALANCE_LIMITS.pageSize): string {
  const url = `${horizonBase(network)}/accounts/${encodeURIComponent(account)}/effects?limit=${pageSize}&order=asc`;
  return cursor ? `${url}&cursor=${encodeURIComponent(cursor)}` : url;
}

export function transactionsUrl(network: StellarNetwork, account: string, cursor: string | null, pageSize: number = BALANCE_LIMITS.pageSize): string {
  const url = `${horizonBase(network)}/accounts/${encodeURIComponent(account)}/transactions?limit=${pageSize}&order=asc`;
  return cursor ? `${url}&cursor=${encodeURIComponent(cursor)}` : url;
}

async function readJson(url: string, fetchImpl: typeof fetch): Promise<ReadOutcome<unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BALANCE_LIMITS.timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (response.status === 404) return { status: "missing" };
    if (!response.ok) return { status: "unavailable", reason: `HTTP ${response.status}` };
    const text = await response.text();
    if (text.length > BALANCE_LIMITS.maxResponseBytes) {
      throw new BalanceReconciliationError("response_too_large", "The provider response exceeded the size limit.");
    }
    try {
      return { status: "ok", value: JSON.parse(text) as unknown };
    } catch {
      return { status: "unavailable", reason: "The provider response was not JSON." };
    }
  } catch (error) {
    if (error instanceof BalanceReconciliationError) throw error;
    return { status: "unavailable", reason: error instanceof Error ? error.message : "The provider request failed." };
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function recordsOf(body: unknown): unknown[] {
  const root = asRecord(body);
  const embedded = asRecord(root?._embedded);
  if (Array.isArray(embedded?.records)) return embedded.records;
  if (Array.isArray(root?.records)) return root.records;
  return [];
}

async function readPages(
  urlFor: (cursor: string | null) => string,
  fetchImpl: typeof fetch,
  paging: Paging,
): Promise<ReadOutcome<{ records: unknown[]; truncated: boolean }>> {
  const records: unknown[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let truncated = false;
  let pages = 0;

  while (pages < paging.maxPages && records.length < paging.maxEffects) {
    const outcome = await readJson(urlFor(cursor), fetchImpl);
    if (outcome.status !== "ok") {
      if (pages === 0) return outcome;
      truncated = true;
      break;
    }
    const page = recordsOf(outcome.value);
    pages += 1;
    for (const record of page) {
      const token = String(asRecord(record)?.paging_token ?? asRecord(record)?.id ?? records.length);
      if (seen.has(token)) continue;
      seen.add(token);
      records.push(record);
    }
    const last = asRecord(page[page.length - 1]);
    const nextCursor = typeof last?.paging_token === "string" ? last.paging_token : null;
    const pageFull = page.length >= paging.pageSize;
    if (records.length >= paging.maxEffects || (pageFull && pages >= paging.maxPages)) {
      truncated = true;
      break;
    }
    if (!nextCursor || !pageFull) break;
    cursor = nextCursor;
  }

  return { status: "ok", value: { records, truncated } };
}

function effectFrom(record: Record<string, unknown>, account: string): RawEffect {
  return {
    id: String(record.id ?? record.paging_token ?? ""),
    pagingToken: String(record.paging_token ?? record.id ?? ""),
    type: String(record.type ?? "unknown"),
    ledger: Number(record.ledger ?? 0),
    account: typeof record.account === "string" ? record.account : account,
    amount: typeof record.amount === "string" ? record.amount : undefined,
    asset_type: typeof record.asset_type === "string" ? record.asset_type : undefined,
    asset_code: typeof record.asset_code === "string" ? record.asset_code : undefined,
    asset_issuer: typeof record.asset_issuer === "string" ? record.asset_issuer : undefined,
    asset: typeof record.asset === "string" ? record.asset : undefined,
    seller: typeof record.seller === "string" ? record.seller : undefined,
    sold_amount: typeof record.sold_amount === "string" ? record.sold_amount : undefined,
    sold_asset_type: typeof record.sold_asset_type === "string" ? record.sold_asset_type : undefined,
    sold_asset_code: typeof record.sold_asset_code === "string" ? record.sold_asset_code : undefined,
    sold_asset_issuer: typeof record.sold_asset_issuer === "string" ? record.sold_asset_issuer : undefined,
    bought_amount: typeof record.bought_amount === "string" ? record.bought_amount : undefined,
    bought_asset_type: typeof record.bought_asset_type === "string" ? record.bought_asset_type : undefined,
    bought_asset_code: typeof record.bought_asset_code === "string" ? record.bought_asset_code : undefined,
    bought_asset_issuer: typeof record.bought_asset_issuer === "string" ? record.bought_asset_issuer : undefined,
    reserves_deposited: Array.isArray(record.reserves_deposited) ? record.reserves_deposited as RawEffect["reserves_deposited"] : undefined,
    reserves_received: Array.isArray(record.reserves_received) ? record.reserves_received as RawEffect["reserves_received"] : undefined,
  };
}

function transactionFrom(record: Record<string, unknown>): FeeTransaction {
  const source = typeof record.source_account === "string" ? record.source_account : "";
  const feeAccount = typeof record.fee_account === "string" ? record.fee_account : source;
  return {
    hash: String(record.hash ?? record.id ?? ""),
    ledger: Number(record.ledger ?? 0),
    feeChargedStroops: String(record.fee_charged ?? "0"),
    feeAccount,
    sourceAccount: source,
    feeBump: feeAccount !== source && feeAccount.length > 0,
  };
}

export async function readAccountHistory(
  network: StellarNetwork,
  account: string,
  fetchImpl: typeof fetch = fetch,
  paging: Paging = { pageSize: BALANCE_LIMITS.pageSize, maxPages: BALANCE_LIMITS.maxPages, maxEffects: BALANCE_LIMITS.maxEffects },
): Promise<ReadOutcome<HistoryRead>> {
  const effectsPage = await readPages((cursor) => effectsUrl(network, account, cursor, paging.pageSize), fetchImpl, paging);
  if (effectsPage.status !== "ok") return effectsPage;
  const transactionsPage = await readPages((cursor) => transactionsUrl(network, account, cursor, paging.pageSize), fetchImpl, paging);
  if (transactionsPage.status !== "ok") return transactionsPage;
  const effects = effectsPage.value.records.map((record) => effectFrom(asRecord(record) ?? {}, account));
  const transactions = transactionsPage.value.records.map((record) => transactionFrom(asRecord(record) ?? {}));
  const ledgers = [...effects.map((effect) => effect.ledger), ...transactions.map((transaction) => transaction.ledger)];
  return {
    status: "ok",
    value: {
      effects,
      transactions,
      opening: null,
      closing: null,
      truncated: effectsPage.value.truncated || transactionsPage.value.truncated,
      oldestLedger: ledgers.length === 0 ? null : Math.min(...ledgers),
    },
  };
}
