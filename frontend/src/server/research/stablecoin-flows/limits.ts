export const STABLECOIN_FLOW_LIMITS = {
  /** Largest accepted request body; the route rejects more without buffering it. */
  maxRequestBytes: 32_768,
  /** Per-provider request timeout. */
  timeoutMs: 8_000,
  /** Longest window that may be requested, in days. */
  maxWindowDays: 90,
  /** Chains that may be read in one request. */
  maxChains: 8,
  /** Events kept per chain. A provider page that fills this is reported as truncated, never silently cut. */
  maxEventsPerChain: 500,
  /** Blocks whose timestamps are read per chain. */
  maxTimestampedBlocks: 200,
  /** `eth_getLogs` pages per chain. */
  maxLogPages: 10,
  /** Blocks per `eth_getLogs` page. */
  blocksPerLogPage: 50_000,
  /** Horizon payment pages per issuer. */
  maxHorizonPages: 10,
  /** Records per Horizon page. */
  horizonPageSize: 200,
  /** Largest events ranked in a report. */
  maxRankedEvents: 25,
} as const;
