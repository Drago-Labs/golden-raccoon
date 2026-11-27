import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";
import type { PoolHistoryState } from "./errors";
import { POOL_HISTORY_LIMITS } from "./limits";

export const POOL_HISTORY_SCHEMA_VERSION = "soroban-pool-history/2026-01" as const;

export type StellarNetwork = "stellar-testnet" | "stellar-pubnet";

export const poolHistoryRequestSchema = z
  .object({
    poolId: z
      .string()
      .trim()
      .refine((value) => StrKey.isValidContract(value), "Expected a Soroban pool contract id"),
    network: z.enum(["stellar-testnet", "stellar-pubnet"]),
    fromLedger: z.coerce.number().int().min(1),
    toLedger: z.coerce.number().int().min(1),
  })
  .superRefine((value, context) => {
    if (value.toLedger < value.fromLedger) {
      context.addIssue({ code: "custom", path: ["toLedger"], message: "The window end is before the start." });
    }
    if (value.toLedger - value.fromLedger > POOL_HISTORY_LIMITS.maxLedgerWindow) {
      context.addIssue({ code: "custom", path: ["toLedger"], message: "The ledger window is too wide." });
    }
  });

export type PoolHistoryRequest = z.infer<typeof poolHistoryRequestSchema>;

export type ReservePoint = {
  ledger: number;
  reserveA: string;
  reserveB: string;
  price: string;
  eventId: string | null;
};

export type LargeTrade = {
  eventId: string;
  ledger: number;
  kind: "swap" | "deposit" | "withdraw" | "sync";
  amountA: string;
  amountB: string;
  priceBefore: string;
  priceAfter: string;
  priceMoveBps: string;
  transactionHash: string;
};

export type DriftReport = {
  matched: boolean;
  rebuiltReserveA: string;
  rebuiltReserveB: string;
  storageReserveA: string | null;
  storageReserveB: string | null;
  deltaA: string | null;
  deltaB: string | null;
};

export type CoverageGap = {
  fromLedger: number;
  toLedger: number;
  reason: "truncated_history" | "missing_storage" | "unknown_layout";
};

export type PoolHistoryReport = {
  schemaVersion: typeof POOL_HISTORY_SCHEMA_VERSION;
  poolId: string;
  network: StellarNetwork;
  fromLedger: number;
  toLedger: number;
  state: PoolHistoryState;
  reserves: ReservePoint[];
  prices: Array<{ ledger: number; price: string }>;
  largeTrades: LargeTrade[];
  drift: DriftReport | null;
  coverageGaps: CoverageGap[];
  coverageNotice: string;
  driftNotice: string | null;
  unsupportedLayouts: string[];
  historyTruncated: boolean;
  readOnly: true;
};
