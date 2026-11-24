import { z } from "zod";
import { STABLECOIN_FLOW_LIMITS } from "./limits";

export const stablecoinFlowRequestSchema = z
  .object({
    assetId: z.string().trim().min(1).max(40),
    chains: z.array(z.string().trim().min(1).max(40)).max(STABLECOIN_FLOW_LIMITS.maxChains).default([]),
    windowStart: z.string().datetime(),
    windowEnd: z.string().datetime(),
    /** How many of the largest single events to rank. */
    topEvents: z.number().int().min(1).max(STABLECOIN_FLOW_LIMITS.maxRankedEvents).default(10),
  })
  .superRefine((value, ctx) => {
    const start = Date.parse(value.windowStart);
    const end = Date.parse(value.windowEnd);
    if (start >= end) {
      ctx.addIssue({ code: "custom", path: ["windowStart"], message: "The window must start before it ends." });
    }
    if (end - start > STABLECOIN_FLOW_LIMITS.maxWindowDays * 86_400_000) {
      ctx.addIssue({
        code: "custom",
        path: ["windowEnd"],
        message: `A window may cover at most ${STABLECOIN_FLOW_LIMITS.maxWindowDays} days.`,
      });
    }
    if (new Set(value.chains.map((chain) => chain.toLowerCase())).size !== value.chains.length) {
      ctx.addIssue({ code: "custom", path: ["chains"], message: "Each chain may be requested only once." });
    }
  });

export type StablecoinFlowRequest = z.infer<typeof stablecoinFlowRequestSchema>;

export type FlowDirection = "mint" | "burn";

/** One mint or burn, normalized to the asset's canonical scale. */
export type FlowEvent = {
  chain: string;
  direction: FlowDirection;
  /** Integer amount in units of 10^-canonicalDecimals of the asset. */
  amountUnits: string;
  /** The same amount as a decimal string. */
  amount: string;
  /** UTC instant the chain recorded for the event. */
  at: string;
  /** UTC day the event is aggregated into. */
  day: string;
  txId: string;
  /** Link to the transaction on that chain's public explorer. */
  txUrl: string;
  /** Where the event was read from. */
  source: string;
};

export type DailyFlow = {
  day: string;
  chain: string;
  mintUnits: string;
  burnUnits: string;
  netUnits: string;
  mint: string;
  burn: string;
  net: string;
  eventCount: number;
};

export type NetIssuance = {
  mintUnits: string;
  burnUnits: string;
  netUnits: string;
  mint: string;
  burn: string;
  net: string;
  eventCount: number;
};

export type ChainCoverage = {
  chain: string;
  state: "complete" | "partial" | "unavailable";
  eventCount: number;
  /** The provider page filled up, so older events in the window are missing. */
  truncated: boolean;
  /** Earliest and latest event the chain actually returned inside the window. */
  firstEventAt: string | null;
  lastEventAt: string | null;
  /** Why a chain is partial or unavailable, in plain words. */
  notes: string[];
  identity: string;
  sourceUrl: string;
};

export type StablecoinFlowReport = {
  state: "complete" | "partial" | "unavailable";
  asset: { id: string; symbol: string; name: string; canonicalDecimals: number };
  window: { start: string; end: string; days: number };
  daily: DailyFlow[];
  /** Net issuance across the window, overall and per chain. */
  netIssuance: NetIssuance;
  netByChain: Array<NetIssuance & { chain: string }>;
  largestEvents: FlowEvent[];
  coverage: ChainCoverage[];
  notes: string[];
  readOnly: true;
};

export type StablecoinFlowResult =
  | { state: "ready"; report: StablecoinFlowReport }
  | { state: "unavailable"; report: StablecoinFlowReport; reason: string };

/** What a chain reader returns: the events it could read, and how complete that is. */
export type ChainReadResult = {
  chain: string;
  events: FlowEvent[];
  truncated: boolean;
  /** Set when the provider could not be read at all. */
  failure?: string;
  /** Set when the derived read range could not reach the start of the window. */
  rangeNote?: string;
};
