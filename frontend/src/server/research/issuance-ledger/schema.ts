import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";
import { assertNetworkPassphrase, type StellarNetwork } from "./assetIdentity";
import type { IssuanceLedgerState } from "./errors";
import { ISSUANCE_LIMITS } from "./limits";

export type { StellarNetwork };

export const ISSUANCE_SCHEMA_VERSION = "issuance-ledger/2026-01" as const;

export const issuanceKinds = ["mint", "burn", "neutral"] as const;
export type IssuanceKind = (typeof issuanceKinds)[number];

export const issuanceRequestSchema = z
  .object({
    assetCode: z.string().trim().min(1).max(12),
    issuer: z.string().trim().refine((value) => StrKey.isValidEd25519PublicKey(value), "Expected a Stellar issuer account"),
    network: z.enum(["stellar-testnet", "stellar-pubnet"]),
    passphrase: z.string().min(1).max(200).optional(),
    fromLedger: z.coerce.number().int().min(1),
    toLedger: z.coerce.number().int().min(1),
  })
  .superRefine((value, context) => {
    if (value.toLedger < value.fromLedger) {
      context.addIssue({ code: "custom", path: ["toLedger"], message: "The window end is before the start." });
    }
    if (value.toLedger - value.fromLedger > ISSUANCE_LIMITS.maxLedgerWindow) {
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

export type IssuanceRequest = z.infer<typeof issuanceRequestSchema>;

export type LedgerOperation = {
  id: string;
  ledger: number;
  type: string;
  kind: IssuanceKind;
  amountStroops: string;
  runningSupplyStroops: string;
  from: string | null;
  to: string | null;
  transactionHash: string | null;
  createdAt: string | null;
};

export type SupplyCheckpoint = {
  ledger: number;
  reconstructedStroops: string;
  networkStroops: string | null;
  deltaStroops: string | null;
  reconciled: boolean;
};

export type UnreconciledGap = {
  ledger: number;
  deltaStroops: string;
  surrounding: LedgerOperation[];
};

export type IssuanceReport = {
  schemaVersion: typeof ISSUANCE_SCHEMA_VERSION;
  assetCode: string;
  issuer: string;
  assetKey: string;
  network: StellarNetwork;
  fromLedger: number;
  toLedger: number;
  state: IssuanceLedgerState;
  reconciled: boolean;
  operations: LedgerOperation[];
  supplySeries: Array<{ ledger: number; supplyStroops: string }>;
  checkpoints: SupplyCheckpoint[];
  unreconciled: UnreconciledGap[];
  networkSupplyStroops: string | null;
  reconstructedSupplyStroops: string;
  historyTruncated: boolean;
  oldestLedger: number | null;
  coverageNotice: string;
  readOnly: true;
};
