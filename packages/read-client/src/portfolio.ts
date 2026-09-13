import { array, nullable, number, optional, shape, text } from "./validation.js";
import type { Transport } from "./transport.js";
import type { ReadOptions, WalletQuery } from "./types.js";
const holdingSchema = shape({ tokenAddress: text, symbol: text, name: text, balance: number, priceUsd: nullable(number), valueUsd: number,
  issuer: optional(text), chainId: optional(text), contractId: optional(text), priceStatus: optional(text) });
export const portfolioSchema = shape({ walletAddress: text, nativeBalance: number, nativeSymbol: text, dayChangePercent: number,
  totalValueUsd: number, riskScore: number, createdAt: text, holdings: array(holdingSchema), valuationStatus: optional(text),
  dataWarnings: optional(array(text)), recentActivity: optional(array(shape({ id: text, type: text, createdAt: text, transactionHash: text, amount: optional(text), asset: optional(text) }))) });
export type Portfolio = ReturnType<typeof portfolioSchema>;
export const portfolioClient = (get: Transport) => ({ get: (query: WalletQuery & { chain?: string }, options?: ReadOptions) => get("/api/portfolio", query, portfolioSchema, options) });
