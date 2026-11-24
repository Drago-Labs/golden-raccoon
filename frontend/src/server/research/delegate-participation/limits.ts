export const DELEGATE_LIMITS = {
  /** Largest accepted request body. */
  maxRequestBytes: 32_768,
  /** Per-provider request timeout. */
  timeoutMs: 8_000,
  /** Blocks that may be scanned in one request. */
  maxBlockSpan: 500_000,
  /** Blocks per `eth_getLogs` page. */
  blocksPerLogPage: 50_000,
  /** `eth_getLogs` pages per log type. */
  maxLogPages: 10,
  /** Delegates that may be named in one request. */
  maxDelegates: 20,
  /** Delegates discovered from delegation events when none is named. */
  maxDiscoveredDelegates: 10,
  /** Voting-power checkpoints kept per delegate. */
  maxCheckpointsPerDelegate: 500,
  /** Proposals read per request. */
  maxProposals: 200,
  /** Votes read per request. */
  maxVotes: 2_000,
  /** Delegation changes ranked in a report. */
  maxRankedChanges: 25,
} as const;
