import type { QuoteRequest, QuoteResult } from "@/server/providers/quote/types";
import type {
  NoRouteError,
  QuoteExclusion,
  QuoteRouteResult,
  QuoteRouteSelection,
  QuoteVenue,
  RankedQuote,
} from "@/server/providers/quote/routing/types";

const SCALE = 1_000_000n;
const DEFAULT_TIMEOUT_MS = 8_000;

function decimalToScaled(value: string | number): bigint | null {
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  if (fraction.length > 6) {
    const rounded = BigInt(fraction.slice(0, 6)) + (Number(fraction[6] ?? "0") >= 5 ? 1n : 0n);
    return BigInt(whole) * SCALE + rounded;
  }
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, "0") || "0");
}

function isExpired(quote: QuoteResult, now: number) {
  const expiry = Date.parse(quote.expiresAt);
  return !Number.isFinite(expiry) || expiry <= now;
}

function malformed(quote: QuoteResult) {
  return decimalToScaled(quote.inputAmount) === null ||
    decimalToScaled(quote.expectedOutputAmount) === null ||
    decimalToScaled(quote.minReceiveAmount) === null ||
    !Number.isFinite(quote.priceImpactBps) ||
    quote.priceImpactBps < 0 ||
    quote.minReceiveAmount !== undefined && quote.route.length < 2;
}

function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`quote venue timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    operation(controller.signal).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function netOutputScore(quote: QuoteResult): bigint {
  const output = decimalToScaled(quote.expectedOutputAmount) ?? 0n;
  // Fee units differ by chain. Fee USD is intentionally treated as a
  // conservative output-unit penalty for deterministic cross-venue ranking.
  const fee = decimalToScaled(String(Math.max(0, quote.feeEstimate.usdValue))) ?? 0n;
  return output > fee ? output - fee : 0n;
}

function compareRanked(left: RankedQuote, right: RankedQuote): number {
  if (left.netOutputScore !== right.netOutputScore) return left.netOutputScore > right.netOutputScore ? -1 : 1;
  if (left.quote.priceImpactBps !== right.quote.priceImpactBps) return left.quote.priceImpactBps - right.quote.priceImpactBps;
  if (left.quote.feeEstimate.usdValue !== right.quote.feeEstimate.usdValue) return left.quote.feeEstimate.usdValue - right.quote.feeEstimate.usdValue;
  return left.venue.localeCompare(right.venue);
}

function exclusion(venue: QuoteVenue, reason: QuoteExclusion["reason"], detail: string): QuoteExclusion {
  return { venue: venue.id, reason, detail };
}

function proof(selected: RankedQuote): QuoteRouteSelection["proof"] {
  return {
    provider: selected.quote.provider,
    network: selected.quote.providerMeta.network,
    route: [...selected.quote.route],
    inputAmount: selected.quote.inputAmount,
    expectedOutputAmount: selected.quote.expectedOutputAmount,
    minReceiveAmount: selected.quote.minReceiveAmount,
    feeAmount: selected.quote.feeEstimate.amount,
    feeUsd: selected.quote.feeEstimate.usdValue,
    netOutputScore: selected.netOutputScore.toString(),
    priceImpactBps: selected.quote.priceImpactBps,
    fetchedAt: selected.quote.fetchedAt,
    expiresAt: selected.quote.expiresAt,
    tieBreak: ["net_output_desc", "price_impact_asc", "fee_usd_asc", "venue_id_asc"],
  };
}

export type AggregateQuoteOptions = {
  maxPriceImpactBps?: number;
  now?: () => number;
  defaultTimeoutMs?: number;
};

/** Fetch all eligible venues concurrently and select a deterministic route. */
export async function aggregateQuotes(
  request: QuoteRequest,
  venues: QuoteVenue[],
  options: AggregateQuoteOptions = {},
): Promise<QuoteRouteResult> {
  const now = options.now ?? Date.now;
  const maxPriceImpactBps = options.maxPriceImpactBps ?? 1_000;
  const exclusions: QuoteExclusion[] = [];
  const candidates: RankedQuote[] = [];

  const results = await Promise.all(venues.map(async (venue) => {
    try {
      const quote = await withTimeout(venue.fetch, venue.timeoutMs ?? options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS);
      return { venue, quote } as const;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      exclusions.push(exclusion(venue, message.includes("timeout") ? "timeout" : "provider_error", message));
      return null;
    }
  }));

  for (const result of results) {
    if (!result) continue;
    const { venue, quote } = result;
    if (malformed(quote)) {
      exclusions.push(exclusion(venue, "malformed", "provider returned malformed numeric or route data"));
      continue;
    }
    if (quote.status === "unavailable") {
      exclusions.push(exclusion(venue, "unavailable", quote.detail));
      continue;
    }
    if (isExpired(quote, now())) {
      exclusions.push(exclusion(venue, "expired", "quote expiry is in the past or invalid"));
      continue;
    }
    if (quote.status === "stale") {
      exclusions.push(exclusion(venue, "stale", "provider marked quote stale"));
      continue;
    }
    if (quote.providerMeta.network !== venue.network) {
      exclusions.push(exclusion(venue, "cross_network", `expected ${venue.network}, got ${quote.providerMeta.network}`));
      continue;
    }
    if (quote.priceImpactBps > maxPriceImpactBps) {
      exclusions.push(exclusion(venue, "price_impact", `${quote.priceImpactBps} bps exceeds ${maxPriceImpactBps} bps`));
      continue;
    }
    candidates.push({ venue: venue.id, quote, netOutputScore: netOutputScore(quote) });
  }

  candidates.sort(compareRanked);
  const selected = candidates[0];
  if (!selected) {
    const error: NoRouteError = {
      code: "no_route",
      message: "No eligible quote route remained after provider, network, expiry, and impact checks.",
      retryable: exclusions.some((item) => item.reason === "timeout" || item.reason === "provider_error"),
      exclusions,
    };
    return { ok: false, request, candidates, exclusions, error };
  }

  return { ok: true, request, selected, candidates, exclusions, proof: proof(selected) };
}

/** Re-fetch a selected venue immediately before prepare/submit. */
export async function revalidateSelectedQuote(
  selection: QuoteRouteSelection,
  venue: QuoteVenue,
  options: AggregateQuoteOptions = {},
): Promise<QuoteRouteResult> {
  const refreshed = await aggregateQuotes(selection.request, [venue], options);
  if (!refreshed.ok) return refreshed;
  const old = selection.selected.quote;
  const next = refreshed.selected.quote;
  if (next.route.join("|") !== old.route.join("|") || next.inputAmount !== old.inputAmount) {
    return {
      ok: false,
      request: selection.request,
      candidates: [],
      exclusions: [{ venue: venue.id, reason: "malformed", detail: "selected route changed during prepare revalidation" }],
      error: { code: "no_route", message: "Selected route changed; prepare must be restarted.", retryable: true, exclusions: [] },
    };
  }
  return refreshed;
}

export { decimalToScaled, netOutputScore };
export type * from "@/server/providers/quote/routing/types";
