import { z } from "zod";
import type { BlendPositionState } from "./errors";
import { SUPPORTED_BLEND_NETWORKS, type BlendNetwork } from "./networkIdentity";

export const blendPositionRequestSchema = z.object({
  accountId: z.string().trim().min(56).max(56).startsWith("G"),
  poolId: z.string().trim().min(56).max(56).startsWith("C"),
  network: z.enum(SUPPORTED_BLEND_NETWORKS),
});

export type BlendPositionRequest = z.infer<typeof blendPositionRequestSchema>;

export type ReserveConfig = {
  poolId: string;
  assetId: string;
  symbol: string;
  decimals: number;
  collateralFactorBps: number;
  liabilityFactorBps: number;
  bRateRaw: string;
  dRateRaw: string;
};

export type RawPositionEntry = {
  poolId: string;
  assetId: string;
  bTokensRaw: string;
  dTokensRaw: string;
};

export type RawAccountPositions = {
  poolId: string;
  accountId: string;
  ledger: number;
  entries: RawPositionEntry[];
};

export type OraclePriceEntry = {
  assetId: string;
  priceUsd: number | null;
  oracleLedger: number | null;
};

export type ConvertedPosition = {
  poolId: string;
  assetId: string;
  symbol: string;
  decimals: number;
  bTokensRaw: string;
  dTokensRaw: string;
  bRateRaw: string;
  dRateRaw: string;
  underlyingSupplyRaw: string;
  underlyingBorrowRaw: string;
  underlyingSupplyFormatted: string;
  underlyingBorrowFormatted: string;
  collateralFactorBps: number;
  liabilityFactorBps: number;
  priceUsd: number | null;
  supplyValueUsd: number | null;
  borrowValueUsd: number | null;
  effectiveCollateralUsd: number | null;
  effectiveLiabilityUsd: number | null;
};

export type HealthFactorBreakdown = {
  available: boolean;
  unavailableReason: string | null;
  totalSupplyUsd: number | null;
  totalBorrowUsd: number | null;
  effectiveCollateralUsd: number | null;
  effectiveLiabilityUsd: number | null;
  healthFactor: number | null;
  status: "healthy" | "near_liquidation" | "liquidatable" | "no_debt" | "unavailable";
};

export type LiquidationScenario = {
  assetId: string;
  symbol: string;
  role: "collateral" | "liability";
  currentPriceUsd: number;
  liquidationPriceUsd: number | null;
  priceMovePctToLiquidation: number | null;
  explanation: string;
};

export type CoverageNotice = {
  reachedProvider: boolean;
  ledger: number | null;
  reservesConfigured: number;
  positionsFound: number;
  missingOracleAssets: string[];
  message: string;
};

export type BlendPositionReport = {
  network: BlendNetwork;
  poolId: string;
  accountId: string;
  state: BlendPositionState;
  ledger: number | null;
  positions: ConvertedPosition[];
  health: HealthFactorBreakdown;
  scenarios: LiquidationScenario[];
  coverage: CoverageNotice;
  warnings: string[];
};
