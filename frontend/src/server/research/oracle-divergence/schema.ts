/**
 * Versioned contract for the oracle-divergence workbench.
 *
 * Everything here is caller-supplied: declared pairs, declared feeds, oracle
 * rounds and market quotes the caller already holds. The handler compares
 * what it was given; it fetches nothing and persists nothing.
 */
import { z } from "zod";

export const ORACLE_SCHEMA_VERSION = "oracle-divergence/2026-01" as const;

export const ORACLE_LIMITS = {
  maxPairs: 12,
  maxFeeds: 24,
  maxRoundsPerFeed: 2_000,
  maxQuotesPerPair: 2_000,
  maxRequestBytes: 1_048_576,
  defaultStaleAfterSeconds: 3_600,
} as const;

const decimalString = z.string().trim().regex(/^\d+(\.\d+)?$/, "Values are non-negative decimal strings.").max(40);
const integerString = z.string().trim().regex(/^\d+$/, "Raw answers are non-negative integer strings.").max(40);

const pairSchema = z.object({
  pairId: z.string().trim().min(1).max(64),
  baseAsset: z.string().trim().min(1).max(32),
  quoteAsset: z.string().trim().min(1).max(32),
});

const feedSchema = z.object({
  feedId: z.string().trim().min(1).max(64),
  pairId: z.string().trim().min(1).max(64),
  chainId: z.string().trim().min(1).max(80),
  contractAddress: z.string().trim().max(120).optional(),
  providerLabel: z.string().trim().min(1).max(120),
  decimals: z.number().int().min(0).max(36),
  heartbeatSeconds: z.number().int().min(1).max(2_592_000),
  /** Some feeds quote quote-per-base rather than base-per-quote. */
  inverted: z.boolean().default(false),
  paused: z.boolean().default(false),
});

const roundSchema = z.object({
  feedId: z.string().trim().min(1).max(64),
  roundId: z.string().trim().min(1).max(80),
  rawAnswer: integerString,
  updatedAt: z.string().datetime({ offset: true }),
});

const quoteSchema = z.object({
  pairId: z.string().trim().min(1).max(64),
  price: decimalString,
  sourceLabel: z.string().trim().min(1).max(160),
  observedAt: z.string().datetime({ offset: true }),
});

export const oracleRequestSchema = z.object({
  windowStart: z.string().datetime({ offset: true }),
  windowEnd: z.string().datetime({ offset: true }),
  staleAfterSeconds: z.number().int().min(1).max(2_592_000).default(ORACLE_LIMITS.defaultStaleAfterSeconds),
  pairs: z.array(pairSchema).max(ORACLE_LIMITS.maxPairs),
  feeds: z.array(feedSchema).max(ORACLE_LIMITS.maxFeeds),
  rounds: z.array(roundSchema).max(ORACLE_LIMITS.maxFeeds * ORACLE_LIMITS.maxRoundsPerFeed),
  quotes: z.array(quoteSchema).max(ORACLE_LIMITS.maxPairs * ORACLE_LIMITS.maxQuotesPerPair),
});

export type OracleRequest = z.infer<typeof oracleRequestSchema>;
export type PairInput = z.infer<typeof pairSchema>;
export type FeedInput = z.infer<typeof feedSchema>;
export type RoundInput = z.infer<typeof roundSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;

export type ComparisonState = "compared" | "stale_feed" | "missing_feed" | "paused_feed";

export type QuoteComparison = {
  observedAt: string;
  sourceLabel: string;
  quotePrice: string;
  feedId: string;
  state: ComparisonState;
  oracleRoundId: string | null;
  oracleUpdatedAt: string | null;
  oraclePrice: string | null;
  spreadBps: number | null;
  note: string;
};

export type FeedSummary = {
  feedId: string;
  providerLabel: string;
  comparedCount: number;
  staleCount: number;
  missingCount: number;
  maxAbsSpreadBps: number | null;
  averageSpreadBps: number | null;
};

export type PairAnalysis = {
  pair: PairInput;
  comparisons: QuoteComparison[];
  feedSummaries: FeedSummary[];
};

export type OracleReport = {
  schemaVersion: typeof ORACLE_SCHEMA_VERSION;
  windowStart: string;
  windowEnd: string;
  pairs: PairAnalysis[];
  /** Feeds or quotes referencing a pairId nobody declared: never guessed into an existing pair. */
  unmappedFeedIds: string[];
  unmappedQuotePairIds: string[];
};

export class OracleError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "OracleError";
    this.code = code;
    this.details = details;
  }
}
