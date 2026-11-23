import { vi } from "vitest";
import type { TransactionHistoryReader } from "@/server/research/performance-attribution/flowReader";
import { normalizeObservation } from "@/server/research/performance-attribution/portfolioInput";
import type { PortfolioObservation, SnapshotInput } from "@/server/research/performance-attribution/schema";
import largeDeposit from "./data/large-deposit.json";
import missingPrices from "./data/missing-prices.json";
import providerUnavailable from "./data/provider-unavailable.json";
import steadyPortfolio from "./data/steady-portfolio.json";

export const fixtures = { steadyPortfolio, largeDeposit, missingPrices, providerUnavailable };

export const WALLET = "0x4444444444444444444444444444444444444444";
export const FOREIGN_WALLET = "0x5555555555555555555555555555555555555555";
export const NETWORK = "ethereum";
export const WETH = "ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
export const USDC = "ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
export const GOAT = "ethereum:0x0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e";

export const scope = { walletAddress: WALLET, network: NETWORK };

/** Deep copy without `structuredClone`, which jsdom does not expose. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type Fixture = {
  window: { start: string; end: string; granularity: "day" | "week" | "month" };
  observations: unknown[];
  history: { items: unknown; nextCursor: string | null };
};

export function fixture(name: keyof typeof fixtures): Fixture {
  return clone(fixtures[name]) as unknown as Fixture;
}

export function observations(name: keyof typeof fixtures): SnapshotInput[] {
  return fixture(name).observations as SnapshotInput[];
}

export function normalized(name: keyof typeof fixtures): PortfolioObservation[] {
  return observations(name).map((row) => normalizeObservation(row, scope));
}

/** Replays one recorded page of the transaction-history read API. */
export function recordedHistory(name: keyof typeof fixtures): TransactionHistoryReader {
  const page = fixture(name).history;
  return vi.fn(async () => ({ items: page.items as never, nextCursor: page.nextCursor }));
}

export function attributionRequest(name: keyof typeof fixtures, overrides: Record<string, unknown> = {}) {
  const recorded = fixture(name);
  return {
    walletAddress: WALLET,
    network: NETWORK,
    windowStart: recorded.window.start,
    windowEnd: recorded.window.end,
    granularity: recorded.window.granularity,
    snapshots: recorded.observations,
    includeLiveSnapshot: false,
    ...overrides,
  };
}
