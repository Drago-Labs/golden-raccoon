import type { FeedInput, OracleRequest, PairInput, QuoteInput, RoundInput } from "@/server/research/oracle-divergence";

if (!window.localStorage) Object.defineProperty(window, "localStorage", { value: { clear() {} } });

export const ethUsdPair: PairInput = { pairId: "eth-usd", baseAsset: "ETH", quoteAsset: "USD" };

export function chainlinkFeed(overrides: Partial<FeedInput> = {}): FeedInput {
  return {
    feedId: "chainlink-eth-usd",
    pairId: "eth-usd",
    chainId: "ethereum",
    providerLabel: "Chainlink",
    decimals: 8,
    heartbeatSeconds: 3_600,
    inverted: false,
    paused: false,
    ...overrides,
  };
}

export function round(overrides: Partial<RoundInput> = {}): RoundInput {
  return { feedId: "chainlink-eth-usd", roundId: "1", rawAnswer: "180000000000", updatedAt: "2026-01-01T00:00:00Z", ...overrides };
}

export function quote(overrides: Partial<QuoteInput> = {}): QuoteInput {
  return { pairId: "eth-usd", price: "1801.10", sourceLabel: "DEX TWAP", observedAt: "2026-01-01T00:05:00Z", ...overrides };
}

export function baseRequest(overrides: Partial<OracleRequest> = {}): OracleRequest {
  return {
    windowStart: "2026-01-01T00:00:00Z",
    windowEnd: "2026-01-01T06:00:00Z",
    staleAfterSeconds: 3_600,
    pairs: [ethUsdPair],
    feeds: [chainlinkFeed()],
    rounds: [round()],
    quotes: [quote()],
    ...overrides,
  };
}
