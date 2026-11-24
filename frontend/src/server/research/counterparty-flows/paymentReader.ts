import { CounterpartyFlowsError } from "./errors";
import { COUNTERPARTY_FLOW_LIMITS } from "./limits";
import type { FlowEvent, StellarNetwork } from "./schema";
import type { ResolvedWindow } from "./windowing";
import { withinWindow } from "./windowing";

const HORIZON: Record<StellarNetwork, string> = {
  "stellar-testnet": "https://horizon-testnet.stellar.org",
  "stellar-pubnet": "https://horizon.stellar.org",
};

export type ReadOutcome =
  | { status: "ok"; events: FlowEvent[]; truncated: boolean; reachedWindowStart: boolean }
  | { status: "missing" }
  | { status: "unavailable"; reason: string };

type HorizonPage = {
  _embedded?: { records?: unknown[] };
  _links?: { next?: { href?: string } };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export function assetKey(record: Record<string, unknown>): string {
  const type = String(record.asset_type ?? "");
  if (type === "native" || record.asset_code == null) return "native";
  const code = String(record.asset_code);
  const issuer = String(record.asset_issuer ?? "");
  return issuer ? `${code}:${issuer}` : code;
}

function normalizePayment(record: Record<string, unknown>, account: string): FlowEvent | null {
  const type = String(record.type ?? "");
  if (type !== "payment") return null;
  const from = String(record.from ?? "");
  const to = String(record.to ?? "");
  if (!from || !to) return null;
  const direction = to === account ? "in" : from === account ? "out" : null;
  if (!direction) return null;
  const counterparty = direction === "in" ? from : to;
  const amount = String(record.amount ?? "");
  const createdAt = String(record.created_at ?? "");
  const transactionAttr = asRecord(record.transaction_attr);
  const ledger = Number(record.ledger ?? transactionAttr?.ledger ?? 0);
  const id = String(record.id ?? record.paging_token ?? "");
  if (!amount || !createdAt || !id || !Number.isFinite(ledger)) return null;
  return {
    id,
    kind: "payment",
    direction,
    counterparty,
    asset: assetKey(record),
    amount,
    createdAt,
    ledger,
  };
}

async function fetchPage(url: string, fetchImpl: typeof fetch): Promise<ReadOutcome & { page?: HorizonPage }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COUNTERPARTY_FLOW_LIMITS.timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (response.status === 404) return { status: "missing" };
    if (!response.ok) return { status: "unavailable", reason: `HTTP ${response.status}` };
    const text = await response.text();
    if (text.length > COUNTERPARTY_FLOW_LIMITS.maxResponseBytes) {
      throw new CounterpartyFlowsError("response_too_large", "The provider response exceeded the size limit.");
    }
    return { status: "ok", events: [], truncated: false, reachedWindowStart: false, page: JSON.parse(text) as HorizonPage };
  } catch (error) {
    if (error instanceof CounterpartyFlowsError) throw error;
    return { status: "unavailable", reason: error instanceof Error ? error.message : "The provider request failed." };
  } finally {
    clearTimeout(timer);
  }
}

/** Reads classic payment operations for an account within the window (newest first). */
export async function readPayments(
  network: StellarNetwork,
  account: string,
  window: ResolvedWindow,
  fetchImpl: typeof fetch = fetch,
): Promise<ReadOutcome> {
  const base = HORIZON[network].replace(/\/$/, "");
  let next: string | undefined =
    `${base}/accounts/${encodeURIComponent(account)}/payments?order=desc&limit=${COUNTERPARTY_FLOW_LIMITS.pageSize}`;
  const events: FlowEvent[] = [];
  let reachedWindowStart = false;
  let truncated = false;

  for (let page = 0; page < COUNTERPARTY_FLOW_LIMITS.maxPages && next; page += 1) {
    const outcome = await fetchPage(next, fetchImpl);
    if (outcome.status !== "ok") {
      if (page === 0) return outcome;
      truncated = true;
      break;
    }
    const records = outcome.page?._embedded?.records ?? [];
    for (const raw of records) {
      const record = asRecord(raw);
      if (!record) continue;
      const createdAt = String(record.created_at ?? "");
      const at = Date.parse(createdAt);
      if (Number.isFinite(at) && at < window.startMs) {
        reachedWindowStart = true;
        break;
      }
      if (!withinWindow(createdAt, window)) continue;
      const event = normalizePayment(record, account);
      if (event) events.push(event);
      if (events.length >= COUNTERPARTY_FLOW_LIMITS.maxEvents) {
        truncated = true;
        break;
      }
    }
    if (reachedWindowStart || truncated) break;
    if (!records.length) {
      reachedWindowStart = true;
      break;
    }
    next = outcome.page?._links?.next?.href;
  }

  return { status: "ok", events, truncated, reachedWindowStart };
}
