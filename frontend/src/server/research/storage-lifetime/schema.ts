import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";
import { decodeLedgerKey } from "./ledgerKeyDecoder";

const ledgerKeyXdr = z.string().trim().min(4).max(4_096);

export const storageRequestSchema = z
  .object({
    walletAddress: z.string().refine(StrKey.isValidEd25519PublicKey, "Expected Stellar account ID"),
    network: z.enum(["stellar-testnet", "stellar-pubnet"]),
    walletNetwork: z.enum(["stellar-testnet", "stellar-pubnet"]),
    contractId: z.string().refine(StrKey.isValidContract, "Expected contract ID"),
    keys: z.array(ledgerKeyXdr).max(40).default([]),
    footprint: z
      .object({
        readOnly: z.array(ledgerKeyXdr).max(40).default([]),
        readWrite: z.array(ledgerKeyXdr).max(40).default([]),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.network !== value.walletNetwork) {
      context.addIssue({ code: "custom", path: ["network"], message: "Network mismatch" });
    }

    const all = [
      ...value.keys,
      ...(value.footprint?.readOnly ?? []),
      ...(value.footprint?.readWrite ?? []),
    ];
    if (all.length === 0) {
      context.addIssue({ code: "custom", path: ["keys"], message: "At least one key required" });
    }
    if (new Set(all).size !== all.length) {
      context.addIssue({ code: "custom", path: ["keys"], message: "Duplicate keys are not allowed" });
    }
    if (all.length > 40 || all.reduce((total, item) => total + item.length, 0) > 65_536) {
      context.addIssue({ code: "custom", path: ["keys"], message: "Footprint is oversized" });
    }
    for (const [index, encoded] of all.entries()) {
      try {
        decodeLedgerKey(encoded, value.contractId);
      } catch (error) {
        context.addIssue({
          code: "custom",
          path: ["keys", index],
          message: error instanceof Error ? error.message : "Invalid ledger key",
        });
      }
    }
  });

export type StorageEntryDiagnostic = {
  keyXdr: string;
  kind: "instance" | "code" | "data" | "unsupported";
  durability: "persistent" | "temporary" | "not_applicable" | "unknown";
  state: "live" | "past_boundary" | "missing" | "unavailable" | "unsupported";
  liveUntilLedger: number | null;
  remainingLedgers: number | null;
  estimatedSecondsRemaining: number | null;
  evidence: string[];
};

export type StorageDiagnostics = {
  contractId: string;
  network: "stellar-testnet" | "stellar-pubnet";
  state: "complete" | "partial" | "unavailable";
  observedLedger: number | null;
  source: string | null;
  entries: StorageEntryDiagnostic[];
  coverage: { requested: number; returned: number; missing: number; message: string };
  warnings: string[];
};
