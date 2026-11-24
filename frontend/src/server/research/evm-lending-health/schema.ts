import { isAddress } from "viem"; import { z } from "zod";
export const lendingHealthRequestSchema = z.object({ address: z.string().refine(isAddress, "Invalid address"), market: z.enum(["aave-v3-ethereum", "aave-v3-base"]), priceMovePercent: z.number().min(-90).max(100).default(-10) });
export type LendingHealthRequest = z.infer<typeof lendingHealthRequestSchema>;
export type Position = { asset: string; symbol: string; collateralAmount: number; debtAmount: number; priceUsd: number; liquidationThreshold: number; eModeThreshold?: number; priceUpdatedAt: string };
export type LendingHealthReport = { address: string; market: string; healthFactor: number | null; borrowCapacityUsd: number; totalDebtUsd: number; eMode: boolean; positions: Array<Position & { liquidationPriceUsd: number | null; stalePrice: boolean }>; sensitivity: Array<{ asset: string; movePercent: number; healthFactor: number | null }>; coverage: string[] };
