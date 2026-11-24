import { z } from "zod";
import type { EvaluationState } from "./errors";
import { TX_PRECONDITIONS_LIMITS } from "./limits";

export type StellarNetwork = "stellar-testnet" | "stellar-pubnet";

const PASSPHRASE: Record<StellarNetwork, string> = {
  "stellar-testnet": "Test SDF Network ; September 2015",
  "stellar-pubnet": "Public Global Stellar Network ; September 2015",
};

const HORIZON: Record<StellarNetwork, string> = {
  "stellar-testnet": "https://horizon-testnet.stellar.org",
  "stellar-pubnet": "https://horizon.stellar.org",
};

export function horizonBase(network: StellarNetwork): string {
  return HORIZON[network];
}

export function expectedPassphrase(network: StellarNetwork): string {
  return PASSPHRASE[network];
}

export const TX_PRECONDITIONS_SCHEMA_VERSION = "tx-preconditions/2026-03" as const;

export const txPreconditionsRequestSchema = z
  .object({
    envelopeXdr: z
      .string()
      .trim()
      .min(1, "Envelope XDR is required")
      .max(TX_PRECONDITIONS_LIMITS.maxEnvelopeXdrChars, "Envelope XDR exceeds the size limit"),
    network: z.enum(["stellar-testnet", "stellar-pubnet"]),
    passphrase: z.string().min(1).max(200).optional(),
    evaluatedAt: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((value, context) => {
    if (value.passphrase !== undefined && value.passphrase !== PASSPHRASE[value.network]) {
      context.addIssue({
        code: "custom",
        path: ["passphrase"],
        message: "Network passphrase does not match the selected network.",
      });
    }
  });

export type TxPreconditionsRequest = z.infer<typeof txPreconditionsRequestSchema>;

export type PreconditionStatus = "satisfied" | "unsatisfied" | "not_set" | "unknown";

export type PreconditionRow = {
  name: string;
  present: boolean;
  value: string | null;
  status: PreconditionStatus;
  explanation: string;
};

export type SignerRequirement = {
  key: string;
  kind: string;
  signaturePresent: boolean;
  canBeSatisfied: boolean;
  note: string;
};

export type ValidityWindow = {
  earliestSubmitAt: string | null;
  latestSubmitAt: string | null;
  earliestLedger: number | null;
  latestLedger: number | null;
  currentlyValid: boolean;
  invalidReasons: string[];
};

export type EnvelopeSummary = {
  isFeeBump: boolean;
  sourceAccount: string;
  feeSource: string | null;
  sequence: string;
  signatureCount: number;
};

export type LedgerSnapshot = {
  ledger: number;
  closeTime: string;
  accountSequence: string | null;
  accountSequenceTime: string | null;
  accountSequenceLedger: number | null;
};

export type PreconditionsReport = {
  schemaVersion: typeof TX_PRECONDITIONS_SCHEMA_VERSION;
  network: StellarNetwork;
  state: EvaluationState;
  envelope: EnvelopeSummary | null;
  preconditions: PreconditionRow[];
  validityWindow: ValidityWindow;
  extraSigners: SignerRequirement[];
  ledger: LedgerSnapshot | null;
  coverageNotice: string;
  readOnly: true;
  signsOrSubmits: false;
};

export { TX_PRECONDITIONS_LIMITS };
