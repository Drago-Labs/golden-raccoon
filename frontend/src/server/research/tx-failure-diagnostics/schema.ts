import { z } from "zod";
import type { DiagnosisState } from "./errors";
import { TX_FAILURE_LIMITS } from "./limits";
import { assertNetworkPassphrase, type StellarNetwork } from "./networkIdentity";

export type { StellarNetwork };

export const TX_FAILURE_SCHEMA_VERSION = "tx-failure-diagnostics/2026-01" as const;

export const txFailureRequestSchema = z
  .object({
    hash: z
      .string()
      .trim()
      .regex(/^[a-fA-F0-9]{64}$/, "Expected a 64-character transaction hash"),
    network: z.enum(["stellar-testnet", "stellar-pubnet"]),
    passphrase: z.string().min(1).max(200).optional(),
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

export type TxFailureRequest = z.infer<typeof txFailureRequestSchema>;

export type OperationOutcome = "would_succeed_alone" | "aborted_transaction" | "not_attempted";

export type OperationDiagnosis = {
  index: number;
  type: string;
  resultCode: string | null;
  outcome: OperationOutcome;
  explanation: string;
  sourceAccount: string | null;
  destination: string | null;
  amountStroops: string | null;
};

export type FeeBumpDiagnosis = {
  outerCode: string;
  innerCode: string;
  outerFeeChargedStroops: string;
  innerFeeChargedStroops: string;
  innerHash: string;
};

export type StateEvidence = {
  account: string;
  status: "historical" | "not_historical" | "missing";
  sequence: string | null;
  nativeBalance: string | null;
  baseReserveXlm: string | null;
  note: string;
};

export type DiagnosisReport = {
  schemaVersion: typeof TX_FAILURE_SCHEMA_VERSION;
  hash: string;
  network: StellarNetwork;
  state: DiagnosisState;
  transactionCode: string | null;
  transactionExplanation: string;
  feeChargedStroops: string | null;
  transactionLevel: boolean;
  feeBump: FeeBumpDiagnosis | null;
  operations: OperationDiagnosis[];
  envelopeOperationCount: number;
  truncatedOperations: boolean;
  stateEvidence: StateEvidence[];
  coverageNotice: string;
  readOnly: true;
  signsOrRetries: false;
};

export { TX_FAILURE_LIMITS };
