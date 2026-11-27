import { isAddress } from "viem";
import { z } from "zod";

export const CLMM_POSITIONS_SCHEMA_VERSION = 1;

export const clmmPositionsRequestSchema = z.object({
  address: z.string().refine(isAddress, "Invalid EVM address"),
  network: z.enum(["ethereum", "base", "arbitrum"]),
  pageSize: z.number().int().positive().max(64).optional(),
  cursor: z.string().optional(),
});

export type ClmmPositionsRequest = z.infer<typeof clmmPositionsRequestSchema>;

export type RangeStatusKind = "in_range" | "out_of_range_below" | "out_of_range_above" | "closed";

export type RangeStatus = {
  status: RangeStatusKind;
  inRange: boolean;
  currentTick: number;
  tickLower: number;
  tickUpper: number;
  currentPrice: string;
  priceLower: string;
  priceUpper: string;
  distanceToLowerPercent: string | null;
  distanceToUpperPercent: string | null;
  distanceToNearestBoundPercent: string | null;
  nearestBound: "lower" | "upper" | null;
};

export type TokenAmounts = {
  amount0: string;
  amount1: string;
  amount0Raw: string;
  amount1Raw: string;
};

export type UncollectedFees = {
  token0: string;
  token1: string;
  token0Raw: string;
  token1Raw: string;
};

export type ExplainedPosition = {
  tokenId: string;
  pool: string;
  token0: string;
  token1: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  feeTierBps: number;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  closed: boolean;
  amounts: TokenAmounts;
  fees: UncollectedFees;
  range: RangeStatus;
};

export type PositionTotals = {
  openPositions: number;
  closedPositions: number;
  inRangePositions: number;
  outOfRangePositions: number;
  amount0: string;
  amount1: string;
  fees0: string;
  fees1: string;
};

export type ClmmPositionsReport = {
  schemaVersion: number;
  address: string;
  network: string;
  deployment: string;
  state: "complete" | "partial" | "unavailable";
  positions: ExplainedPosition[];
  totals: PositionTotals;
  coverageNotice: string;
  coverage: string[];
  nextCursor: string | null;
  readOnly: true;
};
