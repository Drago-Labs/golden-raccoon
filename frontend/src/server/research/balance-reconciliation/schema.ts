import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";
import type { ReconciliationState } from "./errors";
import { BALANCE_LIMITS } from "./limits";
import { assertNetworkPassphrase, type StellarNetwork } from "./networkIdentity";

export type { StellarNetwork };

export const BALANCE_SCHEMA_VERSION = "balance-reconciliation/2026-01" as const;

export const balanceCategories = ["credit", "debit", "fee", "trade", "pool", "claimable", "clawback"] as const;

export type BalanceCategory = (typeof balanceCategories)[number];

export const balanceRequestSchema = z
  .object({
    account: z.string().trim().refine((value) => StrKey.isValidEd25519PublicKey(value), "Expected a Stellar account"),
    network: z.enum(["stellar-testnet", "stellar-pubnet"]),
    passphrase: z.string().min(1).max(200).optional(),
    fromLedger: z.coerce.number().int().min(1),
    toLedger: z.coerce.number().int().min(1),
  })
  .superRefine((value, context) => {
    if (value.toLedger < value.fromLedger) {
      context.addIssue({ code: "custom", path: ["toLedger"], message: "The window end is before the start." });
    }
    if (value.toLedger - value.fromLedger > BALANCE_LIMITS.maxLedgerWindow) {
      context.addIssue({ code: "custom", path: ["toLedger"], message: "The ledger window is too wide." });
    }
    try {
      assertNetworkPassphrase(value.network, value.passphrase);
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["passphrase"],
        message: error instanceof Error ? error.message : "Passphrase does not match the selected network.",
      });
    }
  });

export type BalanceRequest = z.infer<typeof balanceRequestSchema>;

export type BalanceMovement = {
  ledger: number;
  category: BalanceCategory;
  asset: string;
  stroops: string;
  runningStroops: string;
};

export type CategoryTotal = {
  category: BalanceCategory;
  asset: string;
  stroops: string;
};

export type AssetReconciliation = {
  asset: string;
  openingStroops: string;
  reconstructedStroops: string;
  recordedStroops: string | null;
  deltaStroops: string | null;
};

export type BalanceReport = {
  schemaVersion: typeof BALANCE_SCHEMA_VERSION;
  account: string;
  network: StellarNetwork;
  fromLedger: number;
  toLedger: number;
  state: ReconciliationState;
  matched: boolean;
  timeline: BalanceMovement[];
  categories: CategoryTotal[];
  reconciliation: AssetReconciliation[];
  unclassified: Array<{ id: string; type: string }>;
  historyTruncated: boolean;
  oldestLedger: number | null;
  coverageNotice: string;
  readOnly: true;
  pricesConverted: false;
};
