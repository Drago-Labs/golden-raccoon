/**
 * Versioned contract for the CCTP transfer tracker.
 *
 * The line this feature refuses to cross: this tool reports what the
 * source chain, Circle's attestation service, and the destination chain
 * each show about a transfer — as evidence with timestamps and raw
 * identifiers — and never tells the caller "your funds are safe" or
 * "your funds are lost". `transferVerdict` is hard-coded to `null` so no
 * code path can turn step evidence into that kind of judgment.
 */
import { z } from "zod";

export const CCTP_TRANSFER_SCHEMA_VERSION = "cctp-transfers/2026-01" as const;

export type NetworkMode = "mainnet" | "testnet";

export type StepState = "completed" | "pending" | "failed" | "unknown";

export type BurnStep = {
  state: StepState;
  blockNumber: number | null;
  nonce: string | null;
  burnTokenAddress: string | null;
  depositorAddress: string | null;
  mintRecipientRaw: string | null;
  mintRecipientDisplay: string | null;
  destinationDomain: number | null;
  /** Always a display string — an unrecognized domain is shown as "Unknown domain N", never mislabelled as a known chain. */
  destinationChain: string;
  maxFeeBaseUnits: string | null;
  minFinalityThreshold: number | null;
  amountBaseUnits: string | null;
  rawMessageHex: string | null;
  issues: string[];
};

export type AttestationStatus = "pending_confirmations" | "complete" | "not_found" | "unavailable";

export type AttestationStep = {
  state: StepState;
  status: AttestationStatus | null;
  feeExecutedBaseUnits: string | null;
  cctpVersion: number | null;
  /** As reported by Circle's attestation service — not independently verified; see `destination` for that. */
  destinationMintTxHashReported: string | null;
  attestedMessageHex: string | null;
  issues: string[];
};

export type DestinationStep = {
  state: StepState;
  destinationChain: string;
  nonceUsed: boolean | null;
  issues: string[];
};

export type AmountReconciliationState = "reconciled" | "pending_fee" | "unknown";

export type AmountReconciliation = {
  state: AmountReconciliationState;
  grossAmountBaseUnits: string | null;
  feeExecutedBaseUnits: string | null;
  netAmountBaseUnits: string | null;
  note: string;
};

export type CoverageState = "complete" | "partial" | "empty" | "unavailable";

export type CctpTransferReport = {
  schemaVersion: typeof CCTP_TRANSFER_SCHEMA_VERSION;
  evaluatedAt: string;
  network: NetworkMode;
  sourceChain: string;
  sourceDomain: number;
  transactionHash: string;
  burn: BurnStep;
  attestation: AttestationStep;
  destination: DestinationStep;
  amountReconciliation: AmountReconciliation;
  coverage: { state: CoverageState; note: string };
  /** Hard-coded so no code path can turn step evidence into a safety judgment. */
  transferVerdict: null;
  readOnly: true;
};

export const cctpTransferRequestSchema = z.object({
  sourceChain: z.string().min(1).max(64),
  transactionHash: z.string().min(4).max(128),
  network: z.enum(["mainnet", "testnet"]).default("mainnet"),
  evaluatedAt: z.string().datetime().optional(),
});

export type CctpTransferRequest = z.infer<typeof cctpTransferRequestSchema>;
