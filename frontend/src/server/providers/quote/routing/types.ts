import type { QuoteRequest, QuoteResult } from "@/server/providers/quote/types";

export type QuoteVenue = {
  id: string;
  network: string;
  fetch: (signal: AbortSignal) => Promise<QuoteResult>;
  timeoutMs?: number;
};

export type QuoteExclusionReason =
  | "timeout"
  | "provider_error"
  | "expired"
  | "stale"
  | "cross_network"
  | "price_impact"
  | "unavailable"
  | "malformed";

export type QuoteExclusion = {
  venue: string;
  reason: QuoteExclusionReason;
  detail: string;
};

export type RankedQuote = {
  venue: string;
  quote: QuoteResult;
  /** Integer comparison score in quote-output units (scaled by 1e6). */
  netOutputScore: bigint;
};

export type QuoteExecutionProof = {
  provider: string;
  network: string;
  route: string[];
  inputAmount: string;
  expectedOutputAmount: string;
  minReceiveAmount: string;
  feeAmount: string;
  feeUsd: number;
  netOutputScore: string;
  priceImpactBps: number;
  fetchedAt: string;
  expiresAt: string;
  tieBreak: string[];
};

export type QuoteRouteSelection = {
  ok: true;
  request: QuoteRequest;
  selected: RankedQuote;
  candidates: RankedQuote[];
  exclusions: QuoteExclusion[];
  proof: QuoteExecutionProof;
};

export type NoRouteError = {
  code: "no_route";
  message: string;
  retryable: boolean;
  exclusions: QuoteExclusion[];
};

export type QuoteRouteFailure = {
  ok: false;
  request: QuoteRequest;
  candidates: RankedQuote[];
  exclusions: QuoteExclusion[];
  error: NoRouteError;
};

export type QuoteRouteResult = QuoteRouteSelection | QuoteRouteFailure;
