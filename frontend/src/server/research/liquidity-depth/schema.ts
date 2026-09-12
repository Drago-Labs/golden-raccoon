import { z } from "zod";

export type ChainFamily = "evm" | "stellar";

export type VenueModelType = "orderbook" | "constant_product" | "unsupported";

export type AssetIdentifier = {
  symbol: string;
  addressOrCode: string;
  issuer?: string;
  decimals: number;
  chainFamily: ChainFamily;
  network: string;
  name?: string;
};

export type OrderbookLevel = {
  price: string;
  amount: string;
  cumulativeBase?: string;
  cumulativeQuote?: string;
};

export type OrderbookSnapshot = {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
};

export type PoolReserves = {
  baseReserve: string;
  quoteReserve: string;
  baseDecimals: number;
  quoteDecimals: number;
  k?: string;
};

export type VenueSnapshot = {
  venueId: string;
  venueName: string;
  chainFamily: ChainFamily;
  network: string;
  baseAsset: AssetIdentifier;
  quoteAsset: AssetIdentifier;
  modelType: VenueModelType;
  unsupportedReason?: string;
  timestamp: string;
  ledgerOrBlock: number;
  feeBps: number;
  orderbook?: OrderbookSnapshot;
  poolReserves?: PoolReserves;
  isStale: boolean;
  isTruncated?: boolean;
};

export type SizeLadderStep = {
  size: string;
  sizeUsd?: number;
  tradeSide: "buy" | "sell";
  marginalPrice: string;
  averageExecutionPrice: string;
  priceImpactPercent: number;
  feeAmount: string;
  netOutputAmount: string;
  executable: boolean;
  insufficientDepth: boolean;
  warning?: string;
};

export type CumulativeDepthPoint = {
  price: number;
  cumulativeBase: number;
  cumulativeQuote: number;
  depthType: "bid" | "ask" | "pool_bid" | "pool_ask";
};

export type DepthCurve = {
  bids: CumulativeDepthPoint[];
  asks: CumulativeDepthPoint[];
  midPrice: number;
  spreadPercent?: number;
  depthAt1Pct?: number;
  depthAt2Pct?: number;
  depthAt5Pct?: number;
  depthAt10Pct?: number;
};

export type CapacityThreshold = {
  maxImpactPercent: number;
  maxBaseCapacity: string;
  maxQuoteCapacity: string;
  feeAdjustedQuote: string;
  isLimitedByBookDepth: boolean;
};

export type CapacityAnalysis = {
  thresholds: CapacityThreshold[];
  maxObservedDepthBase: string;
  maxObservedDepthQuote: string;
  hasInsufficientDepth: boolean;
  summary: string;
};

export type CoverageStatus =
  | "complete"
  | "partial"
  | "stale"
  | "truncated"
  | "empty"
  | "unsupported"
  | "unavailable";

export type CoverageReport = {
  status: CoverageStatus;
  reasons: string[];
  modelAssumptions: string[];
  dataBoundaryNotice?: string;
  staleAgeSeconds?: number;
  lastObservedAt: string;
  ledgerOrBlock: number;
  isStale?: boolean;
  isTruncated?: boolean;
};

export type LiquidityDepthResult = {
  schemaVersion: "liquidity-depth/2026-01";
  venue: VenueSnapshot;
  curve: DepthCurve;
  ladder: SizeLadderStep[];
  capacity: CapacityAnalysis;
  coverage: CoverageReport;
  disclaimer: string;
};

export const assetIdentifierSchema = z.object({
  symbol: z.string().min(1),
  addressOrCode: z.string().min(1),
  issuer: z.string().optional(),
  decimals: z.number().int().min(0).max(36),
  chainFamily: z.enum(["evm", "stellar"]),
  network: z.string().min(1),
  name: z.string().optional(),
});

export const orderbookLevelSchema = z.object({
  price: z.string().min(1),
  amount: z.string().min(1),
  cumulativeBase: z.string().optional(),
  cumulativeQuote: z.string().optional(),
});

export const orderbookSnapshotSchema = z.object({
  bids: z.array(orderbookLevelSchema),
  asks: z.array(orderbookLevelSchema),
});

export const poolReservesSchema = z.object({
  baseReserve: z.string().min(1),
  quoteReserve: z.string().min(1),
  baseDecimals: z.number().int().min(0).max(36),
  quoteDecimals: z.number().int().min(0).max(36),
  k: z.string().optional(),
});

export const venueSnapshotSchema = z.object({
  venueId: z.string().min(1),
  venueName: z.string().min(1),
  chainFamily: z.enum(["evm", "stellar"]),
  network: z.string().min(1),
  baseAsset: assetIdentifierSchema,
  quoteAsset: assetIdentifierSchema,
  modelType: z.enum(["orderbook", "constant_product", "unsupported"]),
  unsupportedReason: z.string().optional(),
  timestamp: z.string().min(1),
  ledgerOrBlock: z.number().int().nonnegative(),
  feeBps: z.number().int().nonnegative(),
  orderbook: orderbookSnapshotSchema.optional(),
  poolReserves: poolReservesSchema.optional(),
  isStale: z.boolean(),
  isTruncated: z.boolean().optional(),
});

export const liquidityDepthQuerySchema = z.object({
  base: z.string().min(1),
  quote: z.string().min(1).default("USDC"),
  network: z.string().min(1).default("stellar-pubnet"),
  side: z.enum(["buy", "sell"]).default("buy"),
  venueId: z.string().optional(),
  sizes: z.string().optional(),
  fixture: z.string().optional(),
});

export const liquidityDepthRequestSchema = z.object({
  baseSymbol: z.string().optional(),
  quoteSymbol: z.string().optional(),
  network: z.string().optional(),
  side: z.enum(["buy", "sell"]).default("buy"),
  sizes: z.array(z.string()).optional(),
  useFixture: z.boolean().optional(),
  venue: venueSnapshotSchema.optional(),
});
