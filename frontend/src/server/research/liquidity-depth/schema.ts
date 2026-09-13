/**
 * Versioned contract for the liquidity depth workbench.
 *
 * The workbench is informational. It reports what a venue snapshot *shows* —
 * observed order-book levels, or the analytical curve of a constant-product
 * pool — and refuses to extrapolate beyond it. It never produces an executable
 * quote, selects a route, or prepares a transaction.
 */
import { z } from "zod";

export const LIQUIDITY_SCHEMA_VERSION = "liquidity-depth/2026-01" as const;

export const LIQUIDITY_LIMITS = {
  maxOrderBookLevels: 200,
  maxLadderSteps: 24,
  maxVenues: 12,
  maxRequestBytes: 512_000,
  /** A snapshot older than this is reported stale rather than used silently. */
  staleAfterSeconds: 120,
} as const;

/**
 * Which calculation this venue supports. `unsupported_model` exists so a venue
 * whose mechanics this feature does not implement is shown honestly rather than
 * approximated with the wrong maths.
 */
export type VenueModel = "orderbook" | "constant_product" | "unsupported_model";

export type AssetIdentity = {
  /** Chain id exactly as configured. Part of every identity key. */
  chainId: string;
  family: "evm" | "stellar";
  symbol: string;
  /** Decimal places. Amounts are held as integer base units at this scale. */
  decimals: number;
  issuer?: string;
  contractAddress?: string;
  /** Network-scoped canonical key; never collapses across chains. */
  identityKey: string;
};

export type VenueSnapshot = {
  venueId: string;
  label: string;
  model: VenueModel;
  base: AssetIdentity;
  quote: AssetIdentity;
  observedAt: string;
  /** Ledger sequence (Stellar) or block number (EVM), when the source gave one. */
  ledgerOrBlock: string | null;
  /** Fee taken by the venue, in basis points. */
  feeBps: number;
  /** True when the source said more data exists beyond what was returned. */
  truncated: boolean;
  note: string;
};

export type DepthLevel = {
  /** Price in quote base units per one whole unit of base, as a decimal string. */
  price: string;
  /** Size available at this level, in base asset base units. */
  baseAmount: string;
  /** Running total of base amount up to and including this level. */
  cumulativeBaseAmount: string;
  /** Running total of quote spent, in quote base units. */
  cumulativeQuoteAmount: string;
};

export type LadderRung = {
  /** Requested trade size, in base asset base units. */
  requestedBaseAmount: string;
  /** Size the snapshot can actually fill. Equals requested when fillable. */
  fillableBaseAmount: string;
  /** Quote received or spent for `fillableBaseAmount`, fee-adjusted. */
  quoteAmount: string | null;
  /** Effective price for the filled portion, as a decimal string. */
  effectivePrice: string | null;
  /** Basis points of slippage against the best visible price. */
  priceImpactBps: number | null;
  feeBps: number;
  /**
   * `filled` — the snapshot covers this size.
   * `partial` — only part of it is visible.
   * `insufficient_depth` — nothing beyond the visible book.
   * `not_modelled` — the venue's mechanics are not implemented.
   */
  status: "filled" | "partial" | "insufficient_depth" | "not_modelled";
  note: string;
};

export type VenueAnalysis = {
  venue: VenueSnapshot;
  /** Best visible price, as a decimal string; `null` when the book is empty. */
  bestPrice: string | null;
  /** Total visible base-asset depth, in base units. */
  visibleBaseDepth: string;
  levels: DepthLevel[];
  ladder: LadderRung[];
  /** Assumptions a reader must accept for these numbers to mean anything. */
  assumptions: string[];
  /** Reasons this analysis is qualified, e.g. stale or truncated. */
  qualifications: string[];
  state: "complete" | "partial" | "unavailable";
};

export type LiquidityCoverage = {
  state: "complete" | "partial" | "empty";
  venueCount: number;
  modelledVenueCount: number;
  staleVenueCount: number;
  truncatedVenueCount: number;
  unsupportedVenueCount: number;
  note: string;
};

export type LiquidityReport = {
  schemaVersion: typeof LIQUIDITY_SCHEMA_VERSION;
  requestedAt: string;
  venues: VenueAnalysis[];
  coverage: LiquidityCoverage;
  /** Standing disclaimer carried in the payload, not only in the UI. */
  informationalOnly: true;
};

/** Integer base-unit amount as a decimal string, so precision never leaves. */
const baseUnitAmount = z.string().trim().regex(/^\d+$/, "Amounts are integer base units.").max(40);

const assetSchema = z.object({
  chainId: z.string().trim().min(1).max(80),
  symbol: z.string().trim().min(1).max(64),
  decimals: z.number().int().min(0).max(38),
  issuer: z.string().trim().max(120).optional(),
  contractAddress: z.string().trim().max(120).optional(),
});

const orderBookLevelSchema = z.object({
  /** Price as a decimal string; parsed with decimal-safe arithmetic. */
  price: z.string().trim().regex(/^\d+(\.\d+)?$/, "Prices are non-negative decimal strings.").max(40),
  baseAmount: baseUnitAmount,
});

const venueSchema = z.object({
  venueId: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
  model: z.enum(["orderbook", "constant_product", "unsupported_model"]),
  base: assetSchema,
  quote: assetSchema,
  observedAt: z.string().datetime({ offset: true }),
  ledgerOrBlock: z.string().trim().max(80).optional(),
  feeBps: z.number().int().min(0).max(10_000),
  truncated: z.boolean().default(false),
  /** Order-book venues supply levels; pool venues supply reserves. */
  bids: z.array(orderBookLevelSchema).max(LIQUIDITY_LIMITS.maxOrderBookLevels).optional(),
  asks: z.array(orderBookLevelSchema).max(LIQUIDITY_LIMITS.maxOrderBookLevels).optional(),
  baseReserve: baseUnitAmount.optional(),
  quoteReserve: baseUnitAmount.optional(),
});

export const liquidityRequestSchema = z.object({
  /** Trade direction from the taker's point of view. */
  side: z.enum(["buy_base", "sell_base"]).default("sell_base"),
  venues: z.array(venueSchema).min(1).max(LIQUIDITY_LIMITS.maxVenues),
  /** Trade sizes to evaluate, in base asset base units, ascending. */
  ladder: z.array(baseUnitAmount).min(1).max(LIQUIDITY_LIMITS.maxLadderSteps),
  /** Reference time for staleness; defaults to now. */
  now: z.string().datetime({ offset: true }).optional(),
});

export type LiquidityRequest = z.infer<typeof liquidityRequestSchema>;
export type VenueInput = z.infer<typeof venueSchema>;
export type AssetInput = z.infer<typeof assetSchema>;
export type OrderBookLevelInput = z.infer<typeof orderBookLevelSchema>;

export class LiquidityError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "LiquidityError";
    this.code = code;
    this.details = details;
  }
}
