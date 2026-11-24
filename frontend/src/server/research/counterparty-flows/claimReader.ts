import { CounterpartyFlowsError } from "./errors";
import { COUNTERPARTY_FLOW_LIMITS } from "./limits";
import { assetKey, type ReadOutcome } from "./paymentReader";
import type { FlowEvent, StellarNetwork } from "./schema";
import type { ResolvedWindow } from "./windowing";
import { withinWindow } from "./windowing";

const HORIZON: Record<StellarNetwork, string> = {
  "stellar-testnet": "https://horizon-testnet.stellar.org",
  "stellar-pubnet": "https://horizon.stellar.org",
};

type HorizonPage = {
  _embedded?: { records?: unknown[] };
  _links?: { next?: { href?: string } };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

/**
 * Normalizes a claimable-balance claim.
 * Counterparty is the recorded sponsor/source when present; otherwise the event is skipped
 * rather than inventing a peer.
 */
export function normalizeClaim(record: Record<string, unknown>, account: string): FlowEvent | null {
  const type = String(record.type ?? "");
  if (type !== "claim_claimable_balance" && type !== "claimable_balance_claim") return null;

  const claimant = String(record.account ?? record.claimant ?? record.source_account ?? "");
  const counterparty = String(record.sponsor ?? record.counterparty ?? record.from ?? "");
  if (!counterparty || !claimant) return null;

  const direction = claimant === account ? "in" : counterparty === account ? "out" : null;
  if (direction === null) return null;

  const peer = direction === "in" ? counterparty : claimant;
  const amount = String(record.amount ?? "");
  const createdAt = String(record.created_at ?? "");
  const ledger = Number(record.ledger ?? 0);
  const id = String(record.id ?? record.paging_token ?? "");
  if (!amount || !createdAt || !id || !Number.isFinite(ledger)) return null;

  return {
    id,
    kind: "claim",
    direction,
    counterparty: peer,
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

/** Reads claimable-balance claim operations for the account within the window. */
export async function readClaims(
  network: StellarNetwork,
  account: string,
  window: ResolvedWindow,
  fetchImpl: typeof fetch = fetch,
): Promise<ReadOutcome> {
  const base = HORIZON[network].replace(/\/$/, "");
  let next: string | undefined =
    `${base}/accounts/${encodeURIComponent(account)}/operations?order=desc&limit=${COUNTERPARTY_FLOW_LIMITS.pageSize}`;
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
      const event = normalizeClaim(record, account);
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
