/**
 * Versioned contract for the read-only vesting and unlock workbench.
 *
 * Two refusals define this feature.
 *
 * It will not **treat a published schedule as onchain enforcement.** A tranche
 * carries an explicit `sourceType`: `onchain_enforced` when a supported contract
 * produced the unlock, `published_only` when the issuer published a plan that the
 * chain does not enforce. Mixing the two into one “will unlock” number would
 * invent a future that the evidence does not support.
 *
 * It will not **double-count a cancelled or amended schedule.** A superseded
 * revision is kept as evidence with `state: cancelled` and is excluded from
 * future-unlock totals. An unknown beneficiary or unsupported contract is an
 * evidence gap, never a guessed address or invented tranche.
 */
import { z } from "zod";

export const VESTING_SCHEMA_VERSION = "vesting-unlock/2026-01" as const;

export const VESTING_LIMITS = {
  maxSources: 20,
  maxTranches: 2_000,
  /** Shared ceiling for contract and published-schedule reads. */
  maxReads: 100,
  maxRequestBytes: 1_048_576,
  /** Bounds linear expansion into dated segments. */
  maxLinearSegments: 48,
} as const;

export type ChainFamily = "evm" | "stellar";

export type VestingSourceType = "onchain_enforced" | "published_only";

/**
 * Lifecycle of one dated unlock.
 *
 * `released` — already unlocked and transferred or credited.
 * `claimable` — unlocked onchain and waiting for a claim (this feature never claims).
 * `scheduled` — still in the future relative to the observation clock.
 * `cancelled` — superseded by a revision or explicitly cancelled; not counted ahead.
 * `unknown` — evidence is incomplete (stale ledger, missing beneficiary, decode gap).
 */
export type TrancheState = "released" | "claimable" | "scheduled" | "cancelled" | "unknown";

export type VestingAsset = {
  /** Network-aware identity, e.g. `ethereum:0x…` or `stellar-testnet:CODE:ISSUER`. */
  identity: string;
  symbol: string;
  network: string;
  chainFamily: ChainFamily;
  decimals: number;
};

export type UnlockTranche = {
  trancheId: string;
  scheduleId: string;
  revision: number;
  asset: VestingAsset;
  /** Null when the contract or schedule does not name a beneficiary — evidence gap. */
  beneficiary: string | null;
  /** Exact base units. Never a float. */
  amountBaseUnits: string;
  /** ISO-8601 unlock instant in UTC; display TZ is applied separately. */
  unlockAt: string;
  /** Stellar ledger close when the schedule is ledger-bound; otherwise null. */
  unlockLedger: number | null;
  state: TrancheState;
  sourceType: VestingSourceType;
  /** When this tranche was cancelled by a later revision, the winning schedule id. */
  supersededBy: string | null;
  provenance: string;
  evidenceUrl: string | null;
  unknownReason: string | null;
};

export type EvidenceGap = {
  kind: "unknown_beneficiary" | "unsupported_contract" | "stale_ledger" | "decode_failure" | "other";
  sourceId: string;
  detail: string;
};

export type VestingCoverage = {
  state: "complete" | "partial" | "empty" | "unavailable";
  note: string;
  sourceCount: number;
  trancheCount: number;
  countedFutureBaseUnits: string;
  cancelledFutureBaseUnits: string;
  gapCount: number;
  readsUsed: number;
  readBudget: number;
  /** True when observation time came from a ledger older than the configured freshness bound. */
  staleObservation: boolean;
};

export type TimelineBucket = {
  startsAt: string;
  trancheCount: number;
  /** Per-asset exact sums for non-cancelled future or released amounts in the bucket. */
  byAsset: Array<{
    asset: VestingAsset;
    scheduledBaseUnits: string;
    releasedBaseUnits: string;
    claimableBaseUnits: string;
    cancelledBaseUnits: string;
  }>;
};

export type VestingUnlockReport = {
  schemaVersion: typeof VESTING_SCHEMA_VERSION;
  network: string;
  chainFamily: ChainFamily;
  /** Observation clock used to classify states. Always UTC ISO. */
  asOf: string;
  /** IANA time zone used only for display conversion; arithmetic stays in UTC/ledger. */
  displayTimeZone: string;
  observation: {
    ledger: number | null;
    closeTime: string | null;
    source: string | null;
    stale: boolean;
  };
  tranches: UnlockTranche[];
  timeline: TimelineBucket[];
  gaps: EvidenceGap[];
  coverage: VestingCoverage;
  warnings: string[];
  readOnly: true;
  /** This feature never claims, schedules, or submits. */
  claimAndScheduleUnchanged: true;
};

export const vestingSourceSchema = z.object({
  kind: z.enum(["evm_vesting_contract", "stellar_vesting_contract", "issuer_published"]),
  /** Contract address, Soroban id, or issuer-published schedule id. */
  id: z.string().trim().min(1).max(200),
  network: z.string().trim().min(1).max(40),
});

export type VestingSourceRef = z.infer<typeof vestingSourceSchema>;

export const vestingUnlockRequestSchema = z
  .object({
    network: z.string().trim().min(1).max(40),
    chainFamily: z.enum(["evm", "stellar"]),
    sources: z.array(vestingSourceSchema).min(1).max(VESTING_LIMITS.maxSources),
    /** Optional UTC instant; defaults to the observation clock from the reader. */
    asOf: z.string().datetime({ offset: true }).optional(),
    /** IANA zone for display labels only. */
    displayTimeZone: z.string().trim().min(1).max(80).default("UTC"),
    /** Optional beneficiary filter; unmatched onchain rows stay in gaps when unnamed. */
    beneficiary: z.string().trim().min(1).max(120).optional(),
    /**
     * Maximum age of the observation ledger close, in seconds. Past this age the
     * report is marked stale and coverage becomes partial.
     */
    maxObservationAgeSeconds: z.coerce.number().int().min(60).max(86_400).default(3_600),
  })
  .superRefine((value, context) => {
    for (const [index, source] of value.sources.entries()) {
      if (source.network !== value.network) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "network"],
          message: "Source network must match the request network.",
        });
      }

      if (value.chainFamily === "evm" && source.kind === "stellar_vesting_contract") {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "kind"],
          message: "Stellar vesting contracts require chainFamily stellar.",
        });
      }

      if (value.chainFamily === "stellar" && source.kind === "evm_vesting_contract") {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "kind"],
          message: "EVM vesting contracts require chainFamily evm.",
        });
      }
    }
  });

export type VestingUnlockRequest = z.infer<typeof vestingUnlockRequestSchema>;

export class VestingUnlockError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "VestingUnlockError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Raw schedule evidence returned by a reader.
 *
 * The feature never invents fields. Missing beneficiary stays null. An
 * unsupported contract is reported as a gap, not decoded into fake tranches.
 */
export type RawVestingSchedule = {
  scheduleId: string;
  revision: number;
  sourceType: VestingSourceType;
  supported: boolean;
  unsupportedReason?: string;
  cancelled?: boolean;
  supersededBy?: string | null;
  asset: VestingAsset;
  beneficiary: string | null;
  /** Cliff / linear / fixed tranche plans. */
  plan:
    | {
        kind: "cliff";
        /** Total amount that unlocks at the cliff instant. */
        amountBaseUnits: string;
        cliffAt: string;
        cliffLedger?: number | null;
      }
    | {
        kind: "linear";
        amountBaseUnits: string;
        startAt: string;
        endAt: string;
        /** Optional cliff before linear streaming begins. */
        cliffAt?: string | null;
        startLedger?: number | null;
        endLedger?: number | null;
      }
    | {
        kind: "fixed_tranches";
        tranches: Array<{
          amountBaseUnits: string;
          unlockAt: string;
          unlockLedger?: number | null;
          released?: boolean;
          claimable?: boolean;
        }>;
      };
  /** Onchain claimable remainder when the contract reports one. */
  claimableBaseUnits?: string | null;
  releasedBaseUnits?: string | null;
  evidenceUrl?: string | null;
  provenance: string;
};

export type VestingObservation = {
  ledger: number | null;
  closeTime: string | null;
  source: string | null;
  /** Wall clock when the observation was taken, UTC ISO. */
  observedAt: string;
};

export type VestingReadResult = {
  observation: VestingObservation;
  schedules: RawVestingSchedule[];
  gaps: EvidenceGap[];
};

/**
 * Read port for supported vesting contracts and issuer-published schedules.
 *
 * Methods are reads only. There is no claim, schedule, or submit surface, so
 * this feature cannot move tokens or rewrite onchain vesting state.
 */
export type VestingReader = {
  readSource(input: VestingSourceRef): Promise<VestingReadResult>;
};
