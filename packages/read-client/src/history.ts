import { array, boolean, number, optional, record, shape, text } from "./validation.js";
import type { Transport } from "./transport.js";
import type { ReadOptions, WalletQuery } from "./types.js";
import { ReadClientError } from "./errors.js";
export const transactionSchema = shape({ hash: text, type: text, asset: text, valueUsd: number, status: text, lifecycleStatus: text,
  chainFamily: text, network: text, createdAt: text, walletAddress: optional(text), events: array(record), observations: array(record),
  stellarDetails: optional(shape({ sequence: optional(text), feeCharged: optional(number), operationCount: optional(number), ledger: optional(number) })),
  finality: shape({ confirmations: number, required: number, reached: boolean }) });
export const historySchema = shape({ items: array(transactionSchema), total: number, nextCursor: optional(text) });
export type TransactionPage = ReturnType<typeof historySchema>;
export const historyClient = (get: Transport) => ({ transactions: (query: Partial<WalletQuery> & { cursor?: string; limit?: number } = {}, options?: ReadOptions) => {
  if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 200)) throw new ReadClientError("configuration", "History limit must be an integer from 1 to 200.");
  return get("/api/history/transactions", query, historySchema, options);
} });
