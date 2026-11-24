import { z } from "zod";
import { ATTRIBUTION_LIMITS } from "./limits";

const decimal = z.union([z.string().regex(/^-?\d{1,40}(?:\.\d{1,18})?$/), z.number().finite()]);
const assetKey = z.string().trim().min(1).max(200);

export const holdingSchema = z.object({
  /** Chain-scoped asset identity, e.g. `ethereum:0x…` or `stellar:USDC:G…`. */
  key: assetKey,
  symbol: z.string().trim().min(1).max(40),
  chain: z.string().trim().min(1).max(40),
  quantity: decimal,
  /** USD price per unit at the observation, or null when the provider had none. */
  priceUsd: decimal.nullable(),
  valueUsd: decimal.nullable(),
});

export const snapshotInputSchema = z.object({
  walletAddress: z.string().min(1).max(128),
  network: z.string().min(1).max(40),
  at: z.string().datetime(),
  source: z.string().min(1).max(200),
  holdings: z.array(holdingSchema).max(ATTRIBUTION_LIMITS.maxHoldingsPerSnapshot),
});

export const flowRecordSchema = z.object({
  id: z.string().min(1).max(200),
  at: z.string().datetime(),
  /** Chain-scoped asset identity, matching the snapshot holding keys where known. */
  key: assetKey,
  symbol: z.string().trim().min(1).max(40),
  chain: z.string().trim().min(1).max(40),
  /** Signed USD value: positive for value entering the portfolio, negative for value leaving. */
  valueUsd: decimal,
  quantity: decimal.nullable(),
  direction: z.enum(["deposit", "withdrawal"]),
  source: z.string().min(1).max(200),
  txId: z.string().min(1).max(200).nullable(),
});

export const attributionRequestSchema = z
  .object({
    walletAddress: z.string().regex(/^(?:0x[a-fA-F0-9]{40}|G[A-Z2-7]{55})$/),
    network: z.string().trim().min(1).max(40),
    windowStart: z.string().datetime(),
    windowEnd: z.string().datetime(),
    granularity: z.enum(["day", "week", "month"]).default("day"),
    /** Recorded portfolio observations for this wallet and network. */
    snapshots: z.array(snapshotInputSchema).max(ATTRIBUTION_LIMITS.maxSnapshots).default([]),
    /** Read the live portfolio as one more observation at the end of the window. */
    includeLiveSnapshot: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    const start = Date.parse(value.windowStart);
    const end = Date.parse(value.windowEnd);
    if (start >= end) ctx.addIssue({ code: "custom", path: ["windowStart"], message: "The window must start before it ends." });
    if (end - start > ATTRIBUTION_LIMITS.maxWindowDays * 86_400_000) {
      ctx.addIssue({ code: "custom", path: ["windowEnd"], message: `A window may cover at most ${ATTRIBUTION_LIMITS.maxWindowDays} days.` });
    }
    if (value.network.startsWith("stellar") !== value.walletAddress.startsWith("G")) {
      ctx.addIssue({ code: "custom", path: ["walletAddress"], message: "The wallet address does not match the selected network." });
    }
  });

export type AttributionRequest = z.infer<typeof attributionRequestSchema>;
export type SnapshotInput = z.infer<typeof snapshotInputSchema>;
export type FlowRecordInput = z.infer<typeof flowRecordSchema>;

/** A portfolio observation after normalization: exact integer units, one row per asset. */
export type PortfolioObservation = {
  walletAddress: string;
  network: string;
  at: string;
  source: string;
  holdings: Array<{
    key: string;
    /** `chain:symbol`, lower-cased: how the transfer history names the same asset. */
    alias: string;
    symbol: string;
    chain: string;
    /** 10^-18 units. */
    quantityUnits: bigint;
    /** 10^-8 USD per unit, or null when unpriced. */
    priceUsdUnits: bigint | null;
    /** 10^-8 USD, or null when unpriced. */
    valueUsdUnits: bigint | null;
  }>;
  /** False when any holding had no usable price. */
  fullyPriced: boolean;
};

/** An external flow after normalization. Positive USD enters the portfolio. */
export type ExternalFlow = {
  id: string;
  at: string;
  key: string;
  symbol: string;
  chain: string;
  valueUsdUnits: bigint;
  quantityUnits: bigint | null;
  direction: "deposit" | "withdrawal";
  source: string;
  txId: string | null;
};

export type AssetContribution = {
  key: string;
  symbol: string;
  chain: string;
  startValueUsd: string | null;
  endValueUsd: string | null;
  /** Observed change in value across the period. */
  changeUsd: string | null;
  /** The part of the change that entered or left the portfolio. */
  externalFlowUsd: string;
  /** The part of the change the market produced: change − flows. */
  marketUsd: string | null;
  /** Market movement on the units held at the start of the period. */
  priceEffectUsd: string | null;
  /** Market movement on units acquired or released during the period, plus the truncated remainder. */
  residualUsd: string | null;
  /** Share of the period's market movement, in basis points. */
  marketShareBps: string | null;
  state: "complete" | "partial";
  notes: string[];
};

export type ChainContribution = {
  chain: string;
  externalFlowUsd: string;
  marketUsd: string | null;
  priceEffectUsd: string | null;
  residualUsd: string | null;
  marketShareBps: string | null;
  state: "complete" | "partial";
};

export type PeriodAttribution = {
  /** Inclusive period bounds, UTC. */
  start: string;
  end: string;
  label: string;
  state: "complete" | "partial" | "unavailable";
  startObservedAt: string | null;
  endObservedAt: string | null;
  startValueUsd: string | null;
  endValueUsd: string | null;
  changeUsd: string | null;
  externalFlowUsd: string;
  marketUsd: string | null;
  priceEffectUsd: string | null;
  residualUsd: string | null;
  assets: AssetContribution[];
  chains: ChainContribution[];
  flowCount: number;
  notes: string[];
};

export type AttributionReport = {
  state: "complete" | "partial" | "unavailable";
  portfolio: { walletAddress: string; network: string };
  window: { start: string; end: string; granularity: "day" | "week" | "month" };
  periods: PeriodAttribution[];
  /** Totals across every period that could be attributed. */
  totals: {
    changeUsd: string | null;
    externalFlowUsd: string;
    marketUsd: string | null;
    priceEffectUsd: string | null;
    residualUsd: string | null;
    attributedPeriods: number;
    unavailablePeriods: number;
  };
  coverage: string[];
  readOnly: true;
};

export type AttributionResult =
  | { state: "ready"; report: AttributionReport }
  | { state: "unavailable"; report: AttributionReport; reason: string };
