import { TxPreconditionsError } from "./errors";
import { TX_PRECONDITIONS_LIMITS } from "./limits";
import { horizonBase, type StellarNetwork } from "./schema";

export type AccountLedgerState = {
  id: string;
  sequence: string;
  sequenceTimeUnix: number | null;
  sequenceLedger: number | null;
};

export type CurrentLedgerState = {
  ledger: number;
  closeTime: string;
  closeTimeUnix: number;
};

export type ReadOutcome<T> =
  | { status: "ok"; value: T }
  | { status: "missing" }
  | { status: "unavailable"; reason: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseUnix(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === "string" && value.trim() !== "") {
    if (/^\d+$/.test(value)) return Number(value);
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }
  return null;
}

async function readBody(url: string, fetchImpl: typeof fetch): Promise<ReadOutcome<unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TX_PRECONDITIONS_LIMITS.timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (response.status === 404) return { status: "missing" };
    if (!response.ok) return { status: "unavailable", reason: `HTTP ${response.status}` };
    const text = await response.text();
    if (text.length > TX_PRECONDITIONS_LIMITS.maxResponseBytes) {
      throw new TxPreconditionsError("response_too_large", "The provider response exceeded the size limit.");
    }
    try {
      return { status: "ok", value: JSON.parse(text) as unknown };
    } catch {
      return { status: "unavailable", reason: "The provider response was not JSON." };
    }
  } catch (error) {
    if (error instanceof TxPreconditionsError) throw error;
    return { status: "unavailable", reason: error instanceof Error ? error.message : "The provider request failed." };
  } finally {
    clearTimeout(timer);
  }
}

export function latestLedgerUrl(network: StellarNetwork): string {
  return `${horizonBase(network)}/ledgers?order=desc&limit=1`;
}

export function accountUrl(network: StellarNetwork, accountId: string): string {
  return `${horizonBase(network)}/accounts/${encodeURIComponent(accountId)}`;
}

/** Read the newest closed ledger from Horizon. */
export async function readCurrentLedger(
  network: StellarNetwork,
  fetchImpl: typeof fetch = fetch,
): Promise<ReadOutcome<CurrentLedgerState>> {
  const outcome = await readBody(latestLedgerUrl(network), fetchImpl);
  if (outcome.status !== "ok") return outcome;

  const root = asRecord(outcome.value);
  const embedded = asRecord(root?._embedded);
  const records = Array.isArray(embedded?.records) ? embedded.records : [];
  const first = asRecord(records[0]);
  if (!first) return { status: "unavailable", reason: "Horizon returned no ledger records." };

  const ledger = Number(first.sequence);
  const closeTime = typeof first.closed_at === "string" ? first.closed_at : "";
  const closeTimeUnix = parseUnix(closeTime);
  if (!Number.isFinite(ledger) || !closeTime || closeTimeUnix === null) {
    return { status: "unavailable", reason: "Ledger record was missing sequence or closed_at." };
  }

  return { status: "ok", value: { ledger, closeTime, closeTimeUnix } };
}

/** Read the source account sequence, sequence time, and sequence ledger. */
export async function readAccountState(
  network: StellarNetwork,
  accountId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReadOutcome<AccountLedgerState>> {
  const outcome = await readBody(accountUrl(network, accountId), fetchImpl);
  if (outcome.status !== "ok") return outcome;

  const record = asRecord(outcome.value);
  if (!record || typeof record.id !== "string" || typeof record.sequence !== "string") {
    return { status: "unavailable", reason: "Account snapshot was missing an id or sequence." };
  }

  const sequenceLedgerRaw = record.sequence_ledger ?? record.last_modified_ledger;
  const sequenceTimeRaw = record.sequence_time ?? record.last_modified_time;

  return {
    status: "ok",
    value: {
      id: record.id,
      sequence: record.sequence,
      sequenceTimeUnix: parseUnix(sequenceTimeRaw),
      sequenceLedger: typeof sequenceLedgerRaw === "number"
        ? sequenceLedgerRaw
        : typeof sequenceLedgerRaw === "string" && /^\d+$/.test(sequenceLedgerRaw)
          ? Number(sequenceLedgerRaw)
          : null,
    },
  };
}
