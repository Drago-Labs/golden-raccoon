import { DataEntryError } from "./errors";
import { DATA_ENTRY_LIMITS } from "./limits";
import { horizonBase, type StellarNetwork } from "./networkIdentity";
import type { RawManageData } from "./entryHistory";

export type AccountRecord = {
  id: string;
  data: Record<string, string>;
  observationLedger: number | null;
};

export type HistoryRead = {
  operations: RawManageData[];
  truncated: boolean;
  oldestLedger: number | null;
};

export type ReadOutcome<T> = { status: "ok"; value: T } | { status: "missing" } | { status: "unavailable"; reason: string };

export function accountUrl(network: StellarNetwork, account: string): string {
  return `${horizonBase(network)}/accounts/${encodeURIComponent(account)}`;
}

export function operationsUrl(network: StellarNetwork, account: string, cursor: string | null, pageSize: number = DATA_ENTRY_LIMITS.pageSize): string {
  const url = `${horizonBase(network)}/accounts/${encodeURIComponent(account)}/operations?limit=${pageSize}&order=desc`;
  return cursor ? `${url}&cursor=${encodeURIComponent(cursor)}` : url;
}

async function readJson(url: string, fetchImpl: typeof fetch): Promise<ReadOutcome<unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DATA_ENTRY_LIMITS.timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (response.status === 404) return { status: "missing" };
    if (!response.ok) return { status: "unavailable", reason: `HTTP ${response.status}` };
    const text = await response.text();
    if (text.length > DATA_ENTRY_LIMITS.maxResponseBytes) {
      throw new DataEntryError("response_too_large", "The provider response exceeded the size limit.");
    }
    try {
      return { status: "ok", value: JSON.parse(text) as unknown };
    } catch {
      return { status: "unavailable", reason: "The provider response was not JSON." };
    }
  } catch (error) {
    if (error instanceof DataEntryError) throw error;
    return { status: "unavailable", reason: error instanceof Error ? error.message : "The provider request failed." };
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export async function readAccountRecord(
  network: StellarNetwork,
  account: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReadOutcome<AccountRecord>> {
  const outcome = await readJson(accountUrl(network, account), fetchImpl);
  if (outcome.status !== "ok") return outcome;
  const record = asRecord(outcome.value);
  const data = asRecord(record?.data);
  if (!record || typeof record.id !== "string" || !data) {
    return { status: "unavailable", reason: "Account record did not include data entries." };
  }
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") entries[key] = value;
  }
  const ledger = record.last_modified_ledger;
  return {
    status: "ok",
    value: {
      id: record.id,
      data: entries,
      observationLedger: typeof ledger === "number" ? ledger : null,
    },
  };
}

function recordsOf(body: unknown): unknown[] {
  const root = asRecord(body);
  const embedded = asRecord(root?._embedded);
  if (Array.isArray(embedded?.records)) return embedded.records;
  if (Array.isArray(root?.records)) return root.records;
  return [];
}

function toManageData(entry: unknown): RawManageData | null {
  const record = asRecord(entry);
  if (!record || record.type !== "manage_data" || typeof record.name !== "string") return null;
  const value = record.value;
  return {
    id: String(record.id ?? record.paging_token ?? ""),
    pagingToken: String(record.paging_token ?? record.id ?? ""),
    key: record.name,
    valueBase64: typeof value === "string" ? value : null,
    sourceAccount: typeof record.source_account === "string" ? record.source_account : "",
    ledger: Number(record.ledger ?? 0),
  };
}

export async function readManageDataHistory(
  network: StellarNetwork,
  account: string,
  fetchImpl: typeof fetch = fetch,
  paging: { pageSize: number; maxPages: number; maxOperations: number } = {
    pageSize: DATA_ENTRY_LIMITS.pageSize,
    maxPages: DATA_ENTRY_LIMITS.maxPages,
    maxOperations: DATA_ENTRY_LIMITS.maxOperations,
  },
): Promise<ReadOutcome<HistoryRead>> {
  const operations: RawManageData[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let truncated = false;
  let pages = 0;

  while (pages < paging.maxPages && operations.length < paging.maxOperations) {
    const outcome = await readJson(operationsUrl(network, account, cursor, paging.pageSize), fetchImpl);
    if (outcome.status !== "ok") {
      if (pages === 0) return outcome;
      truncated = true;
      break;
    }
    const records = recordsOf(outcome.value);
    pages += 1;
    for (const record of records) {
      const operation = toManageData(record);
      if (!operation || seen.has(operation.pagingToken)) continue;
      seen.add(operation.pagingToken);
      operations.push(operation);
    }
    const last = asRecord(records[records.length - 1]);
    const nextCursor = typeof last?.paging_token === "string" ? last.paging_token : null;
    const pageFull = records.length >= paging.pageSize;
    if (operations.length >= paging.maxOperations || (pageFull && pages >= paging.maxPages)) {
      truncated = true;
      break;
    }
    if (!nextCursor || !pageFull) break;
    cursor = nextCursor;
  }

  const ledgers = operations.map((operation) => operation.ledger);
  return {
    status: "ok",
    value: {
      operations,
      truncated,
      oldestLedger: ledgers.length === 0 ? null : Math.min(...ledgers),
    },
  };
}
