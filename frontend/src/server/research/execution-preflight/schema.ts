/**
 * Versioned contract for read-only execution preflight budgets.
 *
 * Consumes immutable prepared-plan and simulation snapshots. Never creates,
 * signs, or submits a transaction. Exact integer strings are required for token
 * spend, fees, slippage bounds, and reserves — estimates are labelled separately.
 */
import { z } from "zod";

export const PREFLIGHT_SCHEMA_VERSION = "execution-preflight/2026-01" as const;

export const PREFLIGHT_LIMITS = {
  maxRequestBytes: 1_048_576,
  maxRows: 40,
  /** Default freshness window for quotes/simulations. */
  defaultStaleAfterSeconds: 120,
} as const;

export type ChainFamily = "evm" | "stellar";

export type AmountKind = "exact" | "estimate" | "unknown";

export type BudgetRow = {
  rowId: string;
  label: string;
  /** Non-negative integer string in the smallest unit, when known. */
  amount: string | null;
  unit: string;
  kind: AmountKind;
  source: string;
  note: string;
};

export type PreflightBlocker = {
  code:
    | "stale_simulation"
    | "network_mismatch"
    | "plan_hash_mismatch"
    | "insufficient_reserve"
    | "max_slippage"
    | "unavailable_fee"
    | "missing_mandatory"
    | "overflow";
  detail: string;
};

export type PreflightCoverage = {
  /** `complete` only when every mandatory input is present and no blocker fires. */
  state: "complete" | "incomplete" | "unsafe" | "empty";
  safeToPresentAsComplete: boolean;
  blockerCount: number;
  note: string;
};

export type PreflightReport = {
  schemaVersion: typeof PREFLIGHT_SCHEMA_VERSION;
  observedAt: string;
  chainFamily: ChainFamily;
  network: string;
  planHash: string;
  rows: BudgetRow[];
  blockers: PreflightBlocker[];
  totals: {
    worstCaseSpend: string | null;
    worstCaseSpendUnit: string;
    postTxBalance: string | null;
    postTxBalanceUnit: string;
  };
  coverage: PreflightCoverage;
  /** Explicit: this feature never signs or sends. */
  neverSignsOrSends: true;
};

const intString = z
  .string()
  .trim()
  .regex(/^\d+$/, "Amounts must be non-negative integer strings in base units.");

const preparedPlanSchema = z.object({
  planHash: z.string().trim().min(1).max(128),
  network: z.string().trim().min(1).max(80),
  chainFamily: z.enum(["evm", "stellar"]),
  /** Exact token spend in base units. */
  spendAmount: intString,
  spendUnit: z.string().trim().min(1).max(40),
  /** Minimum receive after slippage, exact. */
  minReceiveAmount: intString,
  minReceiveUnit: z.string().trim().min(1).max(40),
  slippageBps: z.number().int().min(0).max(10_000),
  maxSlippageBps: z.number().int().min(0).max(10_000).optional(),
  policyCapAmount: intString.optional(),
  policyCapUnit: z.string().trim().min(1).max(40).optional(),
  walletAvailableAmount: intString,
  walletAvailableUnit: z.string().trim().min(1).max(40),
  /** Account reserve that must remain after the action (Stellar) or zero for EVM. */
  reserveRequiredAmount: intString.default("0"),
  reserveUnit: z.string().trim().min(1).max(40).default("native"),
});

const simulationSchema = z.object({
  planHash: z.string().trim().min(1).max(128),
  network: z.string().trim().min(1).max(80),
  simulatedAt: z.string().datetime({ offset: true }),
  /** EVM gas limit * gas price in wei, when known. */
  evmGasFeeWei: intString.optional(),
  /** Stellar base fee in stroops. */
  stellarBaseFeeStroops: intString.optional(),
  /** Stellar resource fee in stroops. */
  stellarResourceFeeStroops: intString.optional(),
  feeStatus: z.enum(["available", "unavailable"]).default("available"),
});

export const preflightRequestSchema = z.object({
  observedAt: z.string().datetime({ offset: true }),
  staleAfterSeconds: z.number().int().min(1).max(3_600).default(PREFLIGHT_LIMITS.defaultStaleAfterSeconds),
  preparedPlan: preparedPlanSchema,
  simulation: simulationSchema,
});

export type PreflightRequest = z.infer<typeof preflightRequestSchema>;

export class PreflightError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "PreflightError";
    this.code = code;
    this.details = details;
  }
}
