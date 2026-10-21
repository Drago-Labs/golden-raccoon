/**
 * Contract for a read-only explanation of ledger capacity and inclusion fees.
 *
 * Classic inclusion fees and Soroban resource fees are different charges.
 * The report keeps them in separate distributions. It has no field that adds
 * one to the other, and a missing ledger is a gap rather than a zero.
 */
import { z } from "zod";
import type { CoverageKind } from "./errors";
import { CONGESTION_LIMITS } from "./limits";

export const CONGESTION_SCHEMA_VERSION = "network-congestion/2026-10" as const;

export type NetworkRef = {
  id: "stellar-pubnet" | "stellar-testnet";
  passphrase: string;
  caip2: "stellar:pubnet" | "stellar:testnet";
};

export type FeeSplit = "classic" | "soroban" | "unsplit";

/**
 * One included transaction, already separated into fee components.
 *
 * Amounts are stroop totals for that transaction, as decimal strings. They
 * are not per-operation yet, and the Soroban resource fee is not part of
 * `classicInclusionFeeStroops`.
 */
export type ObservedTransaction = {
  hash: string;
  operationCount: number;
  successful: boolean;
  classicInclusionFeeStroops: string | null;
  sorobanInclusionFeeStroops: string | null;
  sorobanResourceFeeStroops: string | null;
  /** Already included in the resource fee. Never an extra charge. */
  sorobanRentFeeStroops: string | null;
  split: FeeSplit;
};

export type ObservedLedger = {
  sequence: number;
  closedAt: string;
  /** Operations in the transaction set. This is the capacity numerator. */
  operationCount: number;
  /** Network maximum operations for this ledger (`max_tx_set_size`). */
  maxOperations: number;
  baseFeeStroops: number;
  transactions: ObservedTransaction[];
  /** Included transactions whose fee could not be classified. */
  omittedTransactionCount: number;
};

export type LedgerGap = {
  fromSequence: number;
  toSequence: number;
  missingCount: number;
};

export type CapacityLedger = {
  sequence: number;
  closedAt: string;
  operationCount: number;
  maxOperations: number;
  /** Floor of operationCount / maxOperations, in basis points. Null when max is not positive. */
  usageBasisPoints: number | null;
  full: boolean;
};

export type CapacitySummary = {
  ledgers: CapacityLedger[];
  gaps: LedgerGap[];
  /** Mean of known usage. Gaps are not inserted as zero. */
  meanUsageBasisPoints: number | null;
  fullLedgerCount: number;
  presentLedgerCount: number;
};

export type SurgePeriod = {
  fromSequence: number;
  toSequence: number;
  ledgerCount: number;
  startedAt: string;
  endedAt: string;
  baseFeeStroops: number;
  /** Lowest classic inclusion fee per operation in the period, in stroops. */
  classicInclusionFloorStroops: string | null;
  /** Lowest Soroban inclusion fee per operation. Not a resource fee. */
  sorobanInclusionFloorStroops: string | null;
  /** True when an inclusion floor was strictly above that period's base fee. */
  pricedAboveBase: boolean;
};

export type FeeDistribution = {
  unit: "stroops_per_operation" | "stroops";
  sampleCount: number;
  p50: string | null;
  p90: string | null;
  p99: string | null;
  min: string | null;
  max: string | null;
};

export type SorobanResourceDistribution = FeeDistribution & {
  /**
   * Sum of rent components for the resource-fee samples.
   * Rent is already inside those samples. Adding it again double-counts.
   */
  rentStroopsIncluded: string;
};

export type FeeSummary = {
  classicInclusion: FeeDistribution;
  sorobanInclusion: FeeDistribution;
  sorobanResource: SorobanResourceDistribution;
};

export type CongestionCoverage = {
  state: Exclude<CoverageKind, "unavailable">;
  note: string;
  presentLedgerCount: number;
  gapCount: number;
  missingLedgerCount: number;
  truncated: boolean;
  omittedTransactionCount: number;
  unsplitSorobanCount: number;
};

export type CongestionLookup = {
  matchedSequence: number;
  matchedClosedAt: string | null;
  note: string;
};

export type CongestionReport = {
  schemaVersion: typeof CONGESTION_SCHEMA_VERSION;
  network: NetworkRef;
  window: {
    fromSequence: number;
    toSequence: number;
    fromTime: string | null;
    toTime: string | null;
    focusSequence: number | null;
  };
  capacity: CapacitySummary;
  surges: SurgePeriod[];
  fees: FeeSummary;
  lookup: CongestionLookup | null;
  coverage: CongestionCoverage;
  /** This feature only reads ledgers. It does not build or submit transactions. */
  readOnly: true;
};

export const congestionRequestSchema = z
  .object({
    network: z.string().trim().min(1).max(40),
    fromSequence: z.number().int().positive().optional(),
    toSequence: z.number().int().positive().optional(),
    fromTime: z.string().datetime({ offset: true }).optional(),
    toTime: z.string().datetime({ offset: true }).optional(),
    atTime: z.string().datetime({ offset: true }).optional(),
    atLedger: z.number().int().positive().optional(),
    radius: z.number().int().min(0).max(CONGESTION_LIMITS.maxRadius).optional(),
  })
  .superRefine((data, ctx) => {
    const hasSequence = data.fromSequence !== undefined || data.toSequence !== undefined;
    const hasTime = data.fromTime !== undefined || data.toTime !== undefined;
    const hasAtTime = data.atTime !== undefined;
    const hasAtLedger = data.atLedger !== undefined;
    const modes = [hasSequence, hasTime, hasAtTime, hasAtLedger].filter(Boolean).length;

    if (modes !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Name exactly one window: a ledger range, a close-time range, a timestamp, or a ledger.",
      });
    }

    if (hasSequence && (data.fromSequence === undefined || data.toSequence === undefined)) {
      ctx.addIssue({ code: "custom", message: "A ledger range needs both fromSequence and toSequence." });
    }

    if (hasTime && (data.fromTime === undefined || data.toTime === undefined)) {
      ctx.addIssue({ code: "custom", message: "A close-time range needs both fromTime and toTime." });
    }

    if (data.radius !== undefined && !hasAtTime && !hasAtLedger) {
      ctx.addIssue({ code: "custom", message: "Radius applies only when looking up a timestamp or a ledger." });
    }
  });

export type CongestionRequest = z.infer<typeof congestionRequestSchema>;
