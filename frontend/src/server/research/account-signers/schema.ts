import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

export const accountSignersRequestSchema = z
  .object({
    walletAddress: z
      .string()
      .refine((value) => StrKey.isValidEd25519PublicKey(value), "Expected a Stellar account")
      .optional(),
    accountAddress: z
      .string()
      .refine((value) => StrKey.isValidEd25519PublicKey(value), "Expected a Stellar account")
      .optional(),
    network: z.enum(["stellar-testnet", "stellar-pubnet"]),
    walletNetwork: z.enum(["stellar-testnet", "stellar-pubnet"]),
  })
  .superRefine((value, context) => {
    if (value.network !== value.walletNetwork) {
      context.addIssue({ code: "custom", path: ["network"], message: "Network does not match connected wallet" });
    }
  });

export type ThresholdBand = "low" | "medium" | "high";

export type SignerEntry = {
  key: string;
  weight: number;
  kind: "ed25519" | "preauth_tx" | "hash_x" | "unknown";
  sponsor: string | null;
};

export type ThresholdSet = {
  low: number;
  medium: number;
  high: number;
  masterWeight: number;
};

export type OperationRequirement = {
  operation: string;
  band: ThresholdBand;
  requiredWeight: number;
  reachable: boolean;
  note: string;
};

export type AccountSignersResult = {
  walletAddress: string;
  accountAddress: string;
  network: "stellar-testnet" | "stellar-pubnet";
  state: "complete" | "partial" | "unavailable";
  generatedAt: string;
  observation: { ledger: number | null; closeTime: string | null; source: string | null };
  thresholds: ThresholdSet | null;
  signers: SignerEntry[];
  totalWeight: number;
  operations: OperationRequirement[];
  sorobanAuthorization: {
    state: "unsupported";
    note: string;
  };
  warnings: string[];
  coverageMessage: string;
};
