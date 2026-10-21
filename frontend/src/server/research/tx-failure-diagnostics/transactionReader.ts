import { TxFailureDiagnosticsError } from "./errors";
import { TX_FAILURE_LIMITS } from "./limits";
import { horizonBase, type StellarNetwork } from "./networkIdentity";
import type { AccountSnapshot } from "./ledgerState";

export type RecordedTransaction = {
  hash: string;
  ledger: number;
  envelopeXdr: string;
  resultXdr: string;
  sourceAccount: string;
  feeSource: string | null;
};

export type ReadOutcome<T> =
  | { status: "ok"; value: T }
  | { status: "missing" }
  | { status: "unavailable"; reason: string };

export function transactionUrl(network: StellarNetwork, hash: string): string {
  return `${horizonBase(network)}/transactions/${encodeURIComponent(hash)}`;
}

export function accountUrl(network: StellarNetwork, accountId: string): string {
  return `${horizonBase(network)}/accounts/${encodeURIComponent(accountId)}`;
}

async function readBody(url: string, fetchImpl: typeof fetch): Promise<ReadOutcome<unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TX_FAILURE_LIMITS.timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (response.status === 404) return { status: "missing" };
    if (!response.ok) return { status: "unavailable", reason: `HTTP ${response.status}` };
    const text = await response.text();
    if (text.length > TX_FAILURE_LIMITS.maxResponseBytes) {
      throw new TxFailureDiagnosticsError("response_too_large", "The provider response exceeded the size limit.");
    }
    try {
      return { status: "ok", value: JSON.parse(text) as unknown };
    } catch {
      return { status: "unavailable", reason: "The provider response was not JSON." };
    }
  } catch (error) {
    if (error instanceof TxFailureDiagnosticsError) throw error;
    return { status: "unavailable", reason: error instanceof Error ? error.message : "The provider request failed." };
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export async function readRecordedTransaction(
  network: StellarNetwork,
  hash: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReadOutcome<RecordedTransaction>> {
  const outcome = await readBody(transactionUrl(network, hash), fetchImpl);
  if (outcome.status !== "ok") return outcome;
  const record = asRecord(outcome.value);
  if (!record || typeof record.envelope_xdr !== "string" || typeof record.result_xdr !== "string") {
    throw new TxFailureDiagnosticsError("invalid_xdr", "Transaction record did not include envelope and result XDR.");
  }
  const feeSource = record.fee_source ?? record.fee_account;
  return {
    status: "ok",
    value: {
      hash: typeof record.hash === "string" ? record.hash : hash,
      ledger: Number(record.ledger ?? 0),
      envelopeXdr: record.envelope_xdr,
      resultXdr: record.result_xdr,
      sourceAccount: typeof record.source_account === "string" ? record.source_account : "",
      feeSource: typeof feeSource === "string" ? feeSource : null,
    },
  };
}

export async function readAccountSnapshot(
  network: StellarNetwork,
  accountId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReadOutcome<AccountSnapshot>> {
  const outcome = await readBody(accountUrl(network, accountId), fetchImpl);
  if (outcome.status !== "ok") return outcome;
  const record = asRecord(outcome.value);
  if (!record || typeof record.id !== "string" || typeof record.sequence !== "string") {
    return { status: "unavailable", reason: "Account snapshot was missing an id or sequence." };
  }
  const balances = Array.isArray(record.balances) ? record.balances : [];
  return {
    status: "ok",
    value: {
      id: record.id,
      sequence: record.sequence,
      subentry_count: Number(record.subentry_count ?? 0),
      observed_ledger: typeof record.observed_ledger === "number" ? record.observed_ledger : null,
      balances: balances.flatMap((entry) => {
        const balance = asRecord(entry);
        if (!balance || typeof balance.asset_type !== "string" || typeof balance.balance !== "string") return [];
        return [{ asset_type: balance.asset_type, balance: balance.balance }];
      }),
    },
  };
}
