import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";
import type { EntryState } from "./errors";
import { DATA_ENTRY_LIMITS } from "./limits";
import { assertNetworkPassphrase, type StellarNetwork } from "./networkIdentity";

export type { StellarNetwork };

export const DATA_ENTRY_SCHEMA_VERSION = "account-data-entries/2026-01" as const;

export const dataEntryRequestSchema = z
  .object({
    account: z.string().trim().refine((value) => StrKey.isValidEd25519PublicKey(value), "Expected a Stellar account"),
    network: z.enum(["stellar-testnet", "stellar-pubnet"]),
    passphrase: z.string().min(1).max(200).optional(),
    recentWindowLedgers: z.coerce.number().int().min(1).max(DATA_ENTRY_LIMITS.recentWindowMax).default(DATA_ENTRY_LIMITS.recentWindowDefault),
  })
  .superRefine((value, context) => {
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

export type DataEntryRequest = z.infer<typeof dataEntryRequestSchema>;

export type DetectedFormat = "account_id" | "contract_id" | "url" | "hash" | "text" | "binary";

export type HistoryAction = "set" | "change" | "delete";

export type HistoryEvent = {
  ledger: number;
  sourceAccount: string;
  action: HistoryAction;
  valueBase64: string | null;
  hex: string | null;
  utf8: string | null;
  format: DetectedFormat | null;
  lastValueBase64: string | null;
  lastValueUtf8: string | null;
};

export type DataEntryView = {
  key: string;
  present: boolean;
  base64: string | null;
  hex: string | null;
  utf8: string | null;
  format: DetectedFormat | null;
  recent: boolean;
  formatChanged: boolean;
  history: HistoryEvent[];
};

export type DataEntryReport = {
  schemaVersion: typeof DATA_ENTRY_SCHEMA_VERSION;
  account: string;
  network: StellarNetwork;
  state: EntryState;
  observationLedger: number | null;
  recentWindowLedgers: number;
  entries: DataEntryView[];
  entryCount: number;
  reservePerEntryXlm: string;
  reserveTotalXlm: string;
  historyTruncated: boolean;
  oldestLedger: number | null;
  coverageNotice: string;
  readOnly: true;
  writesEntries: false;
};
