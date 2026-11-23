import { z } from "zod";

export const POOL_RETURNS_SCHEMA_VERSION = 1;

export const poolReturnsRequestSchema = z.object({
  account: z.string().min(1),
  poolId: z.string().min(1),
  network: z.enum(["stellar-testnet", "stellar-pubnet"]),
  windowStart: z.number().int().positive(),
  windowEnd: z.number().int().positive(),
});

export type PoolReturnsRequest = z.infer<typeof poolReturnsRequestSchema>;

export type ReturnBreakdown = {
  holdValue: string;
  poolValue: string;
  feeIncome: string;
  divergenceLoss: string;
  totalReturn: string;
};

export type PricePoint = {
  ledger: number;
  assetA: string;
  assetB: string;
  priceA: string;
  priceB: string;
};

export type ReserveSnapshot = {
  ledger: number;
  reserveA: string;
  reserveB: string;
  totalShares: string;
};

export type PositionSnapshot = {
  ledger: number;
  shares: string;
  operation: "deposit" | "withdrawal" | "initial";
};

export type CoverageGap = {
  fromLedger: number;
  toLedger: number;
  reason: "missing_reserves" | "missing_prices";
};

export type PoolReturnsReport = {
  schemaVersion: number;
  account: string;
  poolId: string;
  network: string;
  windowStart: number;
  windowEnd: number;
  state: "complete" | "partial" | "unavailable";
  breakdown: ReturnBreakdown | null;
  position: PositionSnapshot[];
  reserves: ReserveSnapshot[];
  prices: PricePoint[];
  coverageGaps: CoverageGap[];
  coverageNotice: string;
  priceSource: string;
  readOnly: boolean;
};
