/**
 * Versioned contract for network fee attribution and efficiency analytics.
 *
 * Two refusals define this feature.
 *
 * It will not **estimate a fee it did not observe.** A charge is either read
 * from a receipt or from transaction metadata, or it is `unknown` — and an
 * unknown charge is carried as its own state through every aggregation rather
 * than silently becoming zero. A total that quietly treats missing data as
 * nothing is worse than no total, because it looks complete.
 *
 * It will not **produce a fiat figure without timestamped conversion
 * evidence.** Fees are charged in the network's own asset. Collapsing several
 * assets into one dollar number requires a price and a time that price was
 * true; without both, the report shows per-asset totals and says why there is
 * no single number.
 */
import { z } from "zod";

export const FEE_SCHEMA_VERSION = "fee-analysis/2026-01" as const;

export const FEE_LIMITS = {
  /** Records normalized in one analysis. */
  maxRecords: 2_000,
  /** Receipt or metadata reads issued per analysis, under one shared budget. */
  maxReads: 200,
  maxRequestBytes: 1_048_576,
  /** Longest window accepted, in days. */
  maxWindowDays: 400,
} as const;

/** Base units per whole unit, for the two fee assets this feature knows. */
export const FEE_ASSET_SCALES = {
  /** wei per ETH-equivalent native unit */
  evm_native: { decimals: 18, baseUnit: "wei" },
  /** stroops per XLM */
  stellar_native: { decimals: 7, baseUnit: "stroop" },
} as const;

export type FeeAssetKind = keyof typeof FEE_ASSET_SCALES;

/**
 * How a charge came to be known.
 *
 * `observed` means a receipt or metadata field said so. `unknown` means the
 * read did not happen or did not carry the field. There is deliberately no
 * `estimated` value produced by this feature: it is accepted as an input state
 * so a caller-supplied estimate can be carried and *kept separate*, never
 * mixed into an observed total.
 */
export type ChargeEvidence = "observed" | "estimated" | "unknown";

/** Operation families fees are grouped by. Derived from the record, not guessed. */
export type OperationCategory = "swap" | "approval" | "transfer" | "trustline" | "agent_log" | "other";

export type FeeAsset = {
  kind: FeeAssetKind;
  /** Display symbol, e.g. "ETH" or "XLM". */
  symbol: string;
  network: string;
  decimals: number;
};

/**
 * One canonical charge.
 *
 * "Canonical" is the important word: a transaction that was replaced, and its
 * replacement, are two records but at most one charge each — and a duplicate
 * observation of the same hash is one charge, not two.
 */
export type FeeCharge = {
  chargeId: string;
  hash: string;
  network: string;
  chainFamily: "evm" | "stellar";
  category: OperationCategory;
  /** Terminal status. A failed transaction is still charged, and still counted. */
  outcome: "succeeded" | "failed" | "unknown";
  occurredAt: string | null;
  asset: FeeAsset | null;
  /** Exact base units. Never a float, never rounded. */
  amountBaseUnits: string | null;
  evidence: ChargeEvidence;
  /** The account the evidence says paid. */
  payer: string | null;
  /** Set when a different account paid for this transaction's source. */
  feeBumpPayer: string | null;
  /** The transaction's own source, when a fee bump makes it distinct from the payer. */
  originalSource: string | null;
  /** Refund actually reported by the chain. Never inferred, never subtracted when absent. */
  refundBaseUnits: string | null;
  /** What was read, so the number can be checked. */
  provenance: string;
  /** Present when this charge could not be established. */
  unknownReason: string | null;
};

/** A record that is deliberately not counted, and the reason. */
export type ExcludedRecord = {
  hash: string;
  reason: "superseded_by_replacement" | "duplicate_observation" | "not_terminal" | "out_of_window" | "other_wallet" | "other_network";
  detail: string;
  /** The hash that carries the canonical charge instead, when there is one. */
  supersededBy: string | null;
};

export type AssetTotal = {
  asset: FeeAsset;
  /** Exact sum of observed charges, in base units. */
  observedBaseUnits: string;
  observedCount: number;
  /** Charges whose amount is unknown. Counted, never valued. */
  unknownCount: number;
  estimatedCount: number;
  refundBaseUnits: string;
  /** Present only when every observed charge in this asset had a priced conversion. */
  fiat: FiatTotal | null;
};

/**
 * A fiat figure and the evidence that licenses it.
 *
 * The conversion rate and the time it was true travel with the number. A fiat
 * total with no `pricedAt` is not producible by this type.
 */
export type FiatTotal = {
  currency: "USD";
  amount: number;
  unitPriceUsd: number;
  pricedAt: string;
  /** How many charges the price was applied to. */
  appliedToCount: number;
};

export type CategoryTotal = {
  category: OperationCategory;
  chargeCount: number;
  /** Per-asset, because adding XLM to ETH is not a sum. */
  byAsset: AssetTotal[];
};

export type NetworkTotal = {
  network: string;
  chargeCount: number;
  byAsset: AssetTotal[];
};

export type TimelinePoint = {
  /** ISO date of the bucket start. */
  startsAt: string;
  chargeCount: number;
  byAsset: AssetTotal[];
};

export type FeeCoverage = {
  state: "complete" | "partial" | "empty" | "unavailable";
  note: string;
  recordCount: number;
  chargeCount: number;
  observedCount: number;
  unknownCount: number;
  excludedCount: number;
  readsUsed: number;
  readBudget: number;
  /** True when at least one asset had no usable conversion evidence. */
  fiatIncomplete: boolean;
};

export type FeeAnalysisReport = {
  schemaVersion: typeof FEE_SCHEMA_VERSION;
  walletAddress: string;
  window: { from: string; to: string; bucket: "day" | "week" | "month" };
  charges: FeeCharge[];
  excluded: ExcludedRecord[];
  byNetwork: NetworkTotal[];
  byCategory: CategoryTotal[];
  timeline: TimelinePoint[];
  coverage: FeeCoverage;
  /**
   * Set when assets could not be combined into one fiat figure. Carried as
   * data so a UI cannot render a single total without acknowledging it.
   */
  fiatUnavailableReason: string | null;
  /** This feature reads records; it never rewrites lifecycle or finality state. */
  readOnly: true;
  feePolicyUnchanged: true;
};

/**
 * A price the caller vouches for, with the moment it was true.
 *
 * There is no default and no fallback source. A caller that supplies no
 * conversions gets per-asset totals, which is the honest output.
 */
export const conversionSchema = z.object({
  assetKind: z.enum(["evm_native", "stellar_native"]),
  network: z.string().trim().min(1).max(40),
  unitPriceUsd: z.number().finite().nonnegative(),
  pricedAt: z.string().datetime({ offset: true }),
});

export type Conversion = z.infer<typeof conversionSchema>;

export const feeAnalysisRequestSchema = z.object({
  walletAddress: z.string().trim().min(1).max(120),
  /**
   * The Stellar account of the same user, when they have one.
   *
   * A wallet is not one address across chain families, and a Stellar record's
   * owner is its `sourceAccount`, not an EVM address. Requiring the caller to
   * name the account explicitly keeps the ownership check exact: a record is
   * in scope only when it belongs to an account the caller vouched for.
   */
  stellarAccount: z.string().trim().min(1).max(120).optional(),
  /** Optional narrowing. Absent means every network in the records. */
  network: z.string().trim().min(1).max(40).optional(),
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  bucket: z.enum(["day", "week", "month"]).default("day"),
  conversions: z.array(conversionSchema).max(20).default([]),
});

export type FeeAnalysisRequest = z.infer<typeof feeAnalysisRequestSchema>;

export class FeeAnalysisError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "FeeAnalysisError";
    this.code = code;
    this.details = details;
  }
}

/**
 * The read port for receipt and metadata lookups.
 *
 * Every method is a read of an already-final transaction. There is no submit,
 * no replace and no fee-policy method, so this feature cannot change what any
 * future transaction pays.
 */
export type FeeReader = {
  readEvmReceipt(input: { hash: string; network: string }): Promise<EvmReceiptRaw>;
  readStellarMeta(input: { hash: string; network: string }): Promise<StellarMetaRaw>;
};

export type EvmReceiptRaw = {
  /** Hex quantity. */
  gasUsed?: string;
  effectiveGasPrice?: string;
  /** Rollup L1 data fee, where the network reports one. */
  l1Fee?: string;
  from?: string;
  status?: string;
  blockTimestamp?: string;
};

export type StellarMetaRaw = {
  /** Stroops, as a decimal string. */
  feeCharged?: string;
  /** The account the ledger charged. Differs from the source under a fee bump. */
  feeAccount?: string;
  sourceAccount?: string;
  successful?: boolean;
  createdAt?: string;
  /** Soroban resource fee, where the transaction carried one. */
  resourceFeeCharged?: string;
};
