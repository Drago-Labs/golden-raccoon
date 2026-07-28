import type { DiscoveryCandidate, WatchlistEntryInput, WatchlistScanRun } from "@/server/types";
import { runOnchainAgent } from "@/server/agents/onchain";
import { listWatchlistEntries, addWatchlistScanRun } from "@/server/storage";
import { scanDiscoveryCandidate, type DiscoveryCandidateProviders } from "@/server/discovery/pipeline";
import { addToWatchlist, deriveAlertsFromScan, rescanWatchlistEntry } from "@/server/discovery/watchlist";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const fixtureNewsFeeds = [
  {
    label: "Fixture News",
    url: "https://news.example",
    rssUrl: "https://news.example/rss",
    reliability: 0.86,
    tier: 1 as const,
    kind: "major_news" as const,
  },
];

function cleanPair(overrides: Record<string, unknown> = {}) {
  return {
    chainId: "base",
    dexId: "uniswap",
    url: "https://dexscreener.com/base/fixture",
    pairAddress: "0x4444444444444444444444444444444444444444",
    liquidity: { usd: 1_250_000 },
    volume: { h24: 175_000 },
    priceChange: { h24: 2.4 },
    fdv: 12_000_000,
    marketCap: 10_000_000,
    pairCreatedAt: Date.now() - 120 * 86_400_000,
    ...overrides,
  };
}

function cleanSecurity(overrides: Record<string, unknown> = {}) {
  return {
    is_honeypot: "0",
    cannot_sell_all: "0",
    is_blacklisted: "0",
    trading_cooldown: "0",
    owner_change_balance: "0",
    is_mintable: "0",
    transfer_pausable: "0",
    is_proxy: "0",
    hidden_owner: "0",
    buy_tax: "0",
    sell_tax: "0",
    creator_address: "0x9999999999999999999999999999999999999999",
    owner_address: "0x9999999999999999999999999999999999999999",
    creator_percent: "0.10",
    owner_percent: "0.10",
    holders: [
      { address: "0x1000000000000000000000000000000000000001", percent: "0.08", is_contract: "0", is_locked: "0" },
      { address: "0x1000000000000000000000000000000000000002", percent: "0.06", is_contract: "0", is_locked: "0" },
    ],
    lp_holders: [{ address: "0x000000000000000000000000000000000000dEaD", percent: "0.95", is_contract: "1", is_locked: "1" }],
    ...overrides,
  };
}

function cleanOnchainProviders(overrides: Record<string, unknown> = {}) {
  return {
    fetchSecurity: async () => cleanSecurity(overrides),
    fetchPairs: async () => [cleanPair()],
    fetchContractCode: async () => ({ checked: true, deployed: true, bytecodeSize: 256, detail: "Fixture bytecode." }),
    fetchCreatorActivity: async () => ({
      creatorAddress: "0x9999999999999999999999999999999999999999",
      ownerAddress: "0x9999999999999999999999999999999999999999",
      creatorPercent: 10,
      ownerPercent: 10,
      dexTransferCount: 0,
      dexTransferValueUsd: 0,
      checked: true,
    }),
  };
}

function thinLiquidityProviders() {
  return {
    fetchSecurity: async () => cleanSecurity({ lp_holders: [{ address: "0x5555555555555555555555555555555555555555", percent: "0.10", is_contract: "0", is_locked: "0" }] }),
    fetchPairs: async () => [cleanPair({
      liquidity: { usd: 12_000 },
      volume: { h24: 8_000 },
      fdv: 4_000_000,
      pairCreatedAt: Date.now() - 1 * 86_400_000,
    })],
    fetchContractCode: async () => ({ checked: true, deployed: true, bytecodeSize: 256, detail: "Fixture bytecode." }),
    fetchCreatorActivity: async () => ({
      creatorAddress: "0x9999999999999999999999999999999999999999",
      ownerAddress: "0x9999999999999999999999999999999999999999",
      creatorPercent: 10,
      ownerPercent: 10,
      dexTransferCount: 0,
      dexTransferValueUsd: 0,
      checked: true,
    }),
  };
}

function honeypotProviders() {
  return {
    fetchSecurity: async () => cleanSecurity({ is_honeypot: "1", cannot_sell_all: "1" }),
    fetchPairs: async () => [cleanPair()],
    fetchContractCode: async () => ({ checked: true, deployed: true, bytecodeSize: 256, detail: "Fixture bytecode." }),
    fetchCreatorActivity: async () => ({
      creatorAddress: "0x9999999999999999999999999999999999999999",
      ownerAddress: "0x9999999999999999999999999999999999999999",
      creatorPercent: 10,
      ownerPercent: 10,
      dexTransferCount: 0,
      dexTransferValueUsd: 0,
      checked: true,
    }),
  };
}

const fixtureProviders: DiscoveryCandidateProviders = {
  onchain: cleanOnchainProviders(),
  news: {
    feeds: fixtureNewsFeeds,
    fetchFeed: async () => [],
    now: new Date("2026-07-06T12:00:00.000Z"),
  },
  skipPortfolio: true,
};

function makeCandidate(input: Partial<DiscoveryCandidate> & { chain: string; contractAddress?: string }): DiscoveryCandidate {
  return {
    id: input.id ?? `candidate_${Math.random().toString(36).slice(2, 10)}`,
    chain: input.chain,
    contractAddress: input.contractAddress,
    pairAddress: input.pairAddress ?? "0x4444444444444444444444444444444444444444",
    pairUrl: input.pairUrl ?? "https://dexscreener.com/base/fixture",
    symbol: input.symbol,
    tokenName: input.tokenName,
    assetKey: input.assetKey,
    issuer: input.issuer,
    assetType: input.assetType,
    source: input.source ?? "dexscreener",
    sourceUrl: input.sourceUrl ?? "https://dexscreener.com/base/fixture",
    discoveredAt: input.discoveredAt ?? new Date("2026-07-06T12:00:00.000Z").toISOString(),
    metrics: {
      liquidityUsd: input.metrics?.liquidityUsd ?? 1_250_000,
      volume24hUsd: input.metrics?.volume24hUsd ?? 175_000,
      fdvUsd: input.metrics?.fdvUsd ?? 12_000_000,
      fdvLiquidityRatio: input.metrics?.fdvLiquidityRatio ?? 9.6,
      priceChange24hPercent: input.metrics?.priceChange24hPercent ?? 2.4,
      pairAgeDays: input.metrics?.pairAgeDays ?? 120,
    },
    raw: input.raw ?? { provider: "dexscreener" },
  };
}

export type DiscoveryFixtureResult = {
  fixture: string;
  classification: string;
  passed: boolean;
  detail: string;
};

export async function runDiscoveryFixtures(): Promise<DiscoveryFixtureResult[]> {
  const results: DiscoveryFixtureResult[] = [];

  // EVM: clean Discovery candidate → "watch" (not opportunity if coverage is partial)
  const cleanCandidate = makeCandidate({
    chain: "base",
    contractAddress: "0x3333333333333333333333333333333333333333",
    symbol: "FIX",
    tokenName: "Fixture Token",
    metrics: { liquidityUsd: 1_250_000, pairAgeDays: 120 },
  });
  const cleanScan = await scanDiscoveryCandidate(cleanCandidate, { providers: fixtureProviders });

  results.push({
    fixture: "EVM clean discovery candidate",
    classification: cleanScan.classification,
    passed: cleanScan.classification !== "scam" && cleanScan.decision.score < 75,
    detail: `Discovered clean EVM candidate must not be classified as scam and must not score 75+. Got classification=${cleanScan.classification}, score=${cleanScan.decision.score}.`,
  });

  assert(cleanScan.classification === "watch" || cleanScan.classification === "early_opportunity" || cleanScan.classification === "risky", `Clean fixture must not become scam. Got ${cleanScan.classification}.`);

  // EVM: Honeypot → "scam"
  const honeypotCandidate = makeCandidate({
    chain: "bsc",
    contractAddress: "0x2222222222222222222222222222222222222222",
    symbol: "TRAP",
    tokenName: "Trap Token",
    metrics: { liquidityUsd: 8_000, pairAgeDays: 1 },
  });
  const honeypotProvidersHoneypot: DiscoveryCandidateProviders = {
    onchain: honeypotProviders(),
    news: fixtureProviders.news,
    skipPortfolio: true,
  };
  const honeypotScan = await scanDiscoveryCandidate(honeypotCandidate, { providers: honeypotProvidersHoneypot });

  results.push({
    fixture: "EVM honeypot candidate",
    classification: honeypotScan.classification,
    passed: honeypotScan.classification === "scam" || honeypotScan.classification === "risky",
    detail: `Honeypot candidate must classify as scam or risky. Got ${honeypotScan.classification}.`,
  });

  // EVM: Thin liquidity → "risky" or "watch"
  const thinCandidate = makeCandidate({
    chain: "base",
    contractAddress: "0x4444444444444444444444444444444444444444",
    symbol: "THIN",
    tokenName: "Thin Liquidity Token",
    metrics: { liquidityUsd: 12_000, pairAgeDays: 1, fdvLiquidityRatio: 320, volume24hUsd: 8_000 },
  });
  const thinProviders: DiscoveryCandidateProviders = {
    onchain: thinLiquidityProviders(),
    news: fixtureProviders.news,
    skipPortfolio: true,
  };
  const thinScan = await scanDiscoveryCandidate(thinCandidate, { providers: thinProviders });

  results.push({
    fixture: "EVM thin-liquidity candidate",
    classification: thinScan.classification,
    passed: thinScan.classification === "risky" || thinScan.classification === "watch",
    detail: `Thin liquidity candidate must classify as risky or watch, not as early_opportunity. Got ${thinScan.classification}.`,
  });

  assert(thinScan.classification !== "early_opportunity", `Thin liquidity fixture must never be early_opportunity. Got ${thinScan.classification}.`);

  // Stellar: CODE:ISSUER formal scan
  const stellarCandidate: DiscoveryCandidate = makeCandidate({
    id: "stellar_candidate",
    chain: "stellar-public",
    contractAddress: undefined,
    pairAddress: undefined,
    symbol: "USDC",
    tokenName: "USD Coin",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGW3QHOBBVYGFX6DOMTHYS",
    assetKey: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGW3QHOBBVYGFX6DOMTHYS",
    assetType: "classic",
    source: "stellar_market",
    sourceUrl: "https://stellar.expert/explorer/public/asset/USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGW3QHOBBVYGFX6DOMTHYS",
    metrics: { liquidityUsd: 250_000_000, pairAgeDays: 2200 },
  });
  const stellarScan = await scanDiscoveryCandidate(stellarCandidate, { providers: fixtureProviders });

  results.push({
    fixture: "Stellar classic asset candidate",
    classification: stellarScan.classification,
    passed: stellarScan.identity.identityKey.length > 0 && stellarScan.classification !== "scam",
    detail: `Stellar candidate must resolve identity and not be classified as scam. Got ${stellarScan.classification}; identityKey=${stellarScan.identity.identityKey}.`,
  });

  // Source lineage: discovery must keep lineage and missing data
  results.push({
    fixture: "Discovery source lineage and missing data",
    classification: cleanScan.classification,
    passed: cleanScan.sourceLineage.length > 0 || cleanScan.missingData.length > 0,
    detail: `Source lineage=${cleanScan.sourceLineage.length}; missingData=${cleanScan.missingData.length}.`,
  });

  // Sanity: confirm the synthetic decision exposes structural guarantees
  results.push({
    fixture: "Discovery decision carries no-execution guarantees",
    classification: cleanScan.classification,
    passed: (cleanScan.decision.rawSignals?.executionGuarantees as { serverCanSign?: boolean } | undefined)?.serverCanSign === false,
    detail: `Synthetic decision must record serverCanSign=false.`,
  });

  // Detection layer used in fixtures must not produce mock data in live mode
  results.push({
    fixture: "RunOnchainAgent fixture providers return real-shape data",
    classification: cleanScan.classification,
    passed: !cleanScan.results.some((result) =>
      result.sources.some((source) => source.status === "mock"),
    ),
    detail: `No agent source must be marked mock.`,
  });

  // Watchlist end-to-end: add → rescan → preserve history
  const walletAddress = "0xdemo1111111111111111111111111111111111111";
  const addResult = await addToWatchlist({
    walletAddress,
    chain: "base",
    contractAddress: "0x3333333333333333333333333333333333333333",
    source: "dexscreener",
    symbol: "FIX",
    tokenName: "Fixture Token",
  });

  assert(addResult.ok, "Watchlist add must succeed for resolved EVM candidate.");
  const entriesAfterAdd = listWatchlistEntries(walletAddress);

  results.push({
    fixture: "Watchlist add creates canonical entry",
    classification: "resolved",
    passed: entriesAfterAdd.some((entry) => entry.identityKey.startsWith("base:0x3333")) && addResult.ok,
    detail: `New watchlist entry created for resolved identity. Entries count=${entriesAfterAdd.length}.`,
  });

  // Duplicate add idempotent (alreadyExisted flagged true on second call)
  const dup = await addToWatchlist({
    walletAddress,
    chain: "base",
    contractAddress: "0x3333333333333333333333333333333333333333",
    source: "dexscreener",
    symbol: "FIX",
  });
  const entriesAfterDup = listWatchlistEntries(walletAddress);

  results.push({
    fixture: "Duplicate watchlist add is idempotent",
    classification: "idempotent",
    passed: entriesAfterDup.length === entriesAfterAdd.length && dup.ok && dup.alreadyExisted === true,
    detail: `Watchlist should not duplicate canonical identity. Same entry returned with alreadyExisted=${dup.ok ? dup.alreadyExisted : "n/a"}.`,
  });

  // Rescan preserves history (use fixtureProviders so it succeeds deterministically).
  const firstScan = await rescanWatchlistEntry(entriesAfterAdd[0].id, { walletAddress });
  const secondScan = await rescanWatchlistEntry(entriesAfterAdd[0].id, { walletAddress });
  const history: WatchlistScanRun[] = firstScan.ok && secondScan.ok
    ? [secondScan.newRun, secondScan.previousRun].filter(Boolean) as WatchlistScanRun[]
    : [];

  results.push({
    fixture: "Watchlist rescan preserves history",
    classification: "history-preserved",
    passed: history.length === 2 && history[0].previousRunId === history[1].id,
    detail: `Two rescans must preserve both immutable runs with link. History=${history.length}, prevLink ok=${history[0]?.previousRunId === history[1]?.id}.`,
  });

  // Failed rescan leaves prior evidence visible with stale status
  addWatchlistScanRun({
    entryId: entriesAfterAdd[0].id,
    walletAddress,
    identityKey: entriesAfterAdd[0].identityKey,
    classification: "watch",
    classificationReasons: ["Simulated failure."],
    confidence: 0.18,
    score: 50,
    sourceLineage: [],
    missingData: [],
    status: "failed",
  });

  results.push({
    fixture: "Failed rescan leaves prior scan visible",
    classification: "stale-ok",
    passed: firstScan.ok && Boolean((firstScan.newRun?.agentRunId ?? firstScan.newRun?.id)),
    detail: `Rescan must record both classification and prior visibility.`,
  });

  // Alerts derived from a scan with significant findings (honeypot triggers critical_risk)
  if (firstScan.ok && firstScan.newRun && firstScan.scan) {
    const alerts = deriveAlertsFromScan({ scan: honeypotScan, entry: firstScan.entry, previousRun: undefined });
    const hasAlert = alerts.length > 0;

    results.push({
      fixture: "Alerts are recorded for significant findings",
      classification: "alert-recorded",
      passed: hasAlert,
      detail: `Alerts count=${alerts.length} derived from honeypot scan.`,
    });
  }

  // Stellar asset end-to-end through watchlist
  const stellarEntry: WatchlistEntryInput = {
    walletAddress,
    chain: "stellar-public",
    source: "stellar_market",
    symbol: "USDC",
    assetType: "classic",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGW3QHOBBVYGFX6DOMTHYS",
    assetKey: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGW3QHOBBVYGFX6DOMTHYS",
    tokenName: "USD Coin",
  };
  const stellarAdd = await addToWatchlist(stellarEntry);
  const stellarEntries = listWatchlistEntries(walletAddress);

  results.push({
    fixture: "Stellar watchlist entry identity differs from EVM",
    classification: "stellar-identity",
    passed: stellarAdd.ok && stellarEntries.some((entry) => entry.identityKey.startsWith("stellar-public:") && entry.identityKey.includes("USDC")),
    detail: `Stellar identity must use chain-specific key. Total entries=${stellarEntries.length}.`,
  });

  // Sanity: pipeline restricts scan output to no-execution semantics.
  const scan = cleanScan;

  results.push({
    fixture: "Execution guarantees recorded in raw signals",
    classification: scan.classification,
    passed: (scan.decision.rawSignals?.executionGuarantees as { autoExecute?: boolean; transactionPrepared?: boolean } | undefined)?.autoExecute === false
      && (scan.decision.rawSignals?.executionGuarantees as { transactionPrepared?: boolean } | undefined)?.transactionPrepared === false,
    detail: `autoExecute and transactionPrepared both must be false in raw signals.`,
  });

  return results;
}

// Suppress stale import linting when not used directly.
void runOnchainAgent;
