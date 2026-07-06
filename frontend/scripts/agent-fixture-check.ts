import { runNewsAgent } from "../src/server/agents/news";
import { runOnchainAgent } from "../src/server/agents/onchain";
import { runDecisionAgent } from "../src/server/agents/decision";
import { runSocialAgent } from "../src/server/agents/social";
import type { AgentResult } from "../src/server/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
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
      { address: "0x1000000000000000000000000000000000000003", percent: "0.04", is_contract: "0", is_locked: "0" },
    ],
    lp_holders: [{ address: "0x000000000000000000000000000000000000dEaD", percent: "0.95", is_contract: "1", is_locked: "1" }],
    ...overrides,
  };
}

function pair(overrides: Record<string, unknown> = {}) {
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

async function runOnchainChecks() {
  const baseInput = {
    chain: "base",
    contractAddress: "0x3333333333333333333333333333333333333333",
  };
  const creatorOk = async () => ({
    creatorAddress: "0x9999999999999999999999999999999999999999",
    ownerAddress: "0x9999999999999999999999999999999999999999",
    creatorPercent: 10,
    ownerPercent: 10,
    dexTransferCount: 0,
    dexTransferValueUsd: 0,
    checked: true,
  });

  const honeypot = await runOnchainAgent(baseInput, {
    fetchSecurity: async () => cleanSecurity({ is_honeypot: "1", cannot_sell_all: "1" }),
    fetchPairs: async () => [pair()],
    fetchCreatorActivity: creatorOk,
  });
  assert(honeypot.recommendedAction === "avoid", "Honeypot fixture must recommend avoid.");
  assert(honeypot.riskScore >= 75, "Honeypot fixture must produce critical risk.");

  const lowLiquidity = await runOnchainAgent(baseInput, {
    fetchSecurity: async () => cleanSecurity({ lp_holders: [{ address: "0x5555555555555555555555555555555555555555", percent: "0.10", is_contract: "0", is_locked: "0" }] }),
    fetchPairs: async () => [pair({ liquidity: { usd: 12_000 }, volume: { h24: 8_000 }, fdv: 4_000_000, pairCreatedAt: Date.now() - 1 * 86_400_000 })],
    fetchCreatorActivity: creatorOk,
  });
  assert(lowLiquidity.riskScore >= 50, "Low liquidity fixture must produce high risk.");
  assert(lowLiquidity.recommendedAction === "manual_review" || lowLiquidity.recommendedAction === "avoid", "Low liquidity fixture must not recommend hold.");

  const blueChip = await runOnchainAgent(baseInput, {
    fetchSecurity: async () => cleanSecurity(),
    fetchPairs: async () => [pair()],
    fetchCreatorActivity: creatorOk,
  });
  assert(blueChip.riskScore < 50, "Blue-chip/high-liquidity fixture must stay low/medium risk.");
  assert(blueChip.recommendedAction === "hold" || blueChip.recommendedAction === "watch", "Blue-chip/high-liquidity fixture must not force manual review.");

  const dexOnly = await runOnchainAgent(baseInput, {
    fetchSecurity: async () => {
      throw new Error("security provider down");
    },
    fetchPairs: async () => [pair()],
    fetchCreatorActivity: async () => undefined,
  });
  assert(dexOnly.sources.some((source) => source.label === "DexScreener token pairs" && source.status === "connected"), "DEX source must work when security provider is down.");
  assert(dexOnly.sources.some((source) => source.label === "GoPlus token security" && source.status === "unavailable"), "Security provider outage must be visible.");
}

const newsFeeds = [
  {
    label: "Fixture News",
    url: "https://news.example",
    rssUrl: "https://news.example/rss",
    reliability: 0.86,
    tier: 1 as const,
    kind: "major_news" as const,
  },
  {
    label: "Fixture Exchange",
    url: "https://exchange.example",
    rssUrl: "https://exchange.example/rss",
    reliability: 0.78,
    tier: 2 as const,
    kind: "exchange_announcement" as const,
  },
];

const now = new Date("2026-07-06T12:00:00.000Z");

function item(title: string, description: string, source = "Fixture News", link = `https://news.example/${encodeURIComponent(title)}`) {
  return {
    title,
    description,
    link,
    publishedAt: new Date("2026-07-05T12:00:00.000Z"),
    source,
    sourceTier: source === "Fixture Exchange" ? (2 as const) : (1 as const),
    sourceKind: source === "Fixture Exchange" ? ("exchange_announcement" as const) : ("major_news" as const),
    reliability: source === "Fixture Exchange" ? 0.78 : 0.86,
  };
}

function getRaw<T>(result: AgentResult, key: string): T {
  return result.rawSignals?.[key] as T;
}

async function runNewsChecks() {
  const symbolOnly = await runNewsAgent(
    { symbol: "GOAT" },
    {
      feeds: newsFeeds,
      now,
      fetchFeed: async () => [item("GOAT announces new integration", "$GOAT integration update")],
    },
  );
  assert(getRaw<number>(symbolOnly, "identityMatchConfidence") < 0.35, "Symbol-only news match must stay low confidence.");
  assert(symbolOnly.recommendedAction === "manual_review", "Symbol-only news match must require manual review.");

  const exploit = await runNewsAgent(
    { symbol: "EXPL", tokenName: "Exploit Token" },
    {
      feeds: newsFeeds,
      now,
      fetchFeed: async () => [item("Exploit Token suffers major exploit", "Security warning: funds drained after exploit.")],
    },
  );
  assert(exploit.findings.some((finding) => finding.label === "Negative catalysts" && (finding.severity === "high" || finding.severity === "critical")), "Hack/exploit news must create high or critical impact.");

  const listing = await runNewsAgent(
    { symbol: "LIST", tokenName: "Listing Token" },
    {
      feeds: newsFeeds,
      now,
      fetchFeed: async () => [item("Fixture Exchange will list Listing Token", "Official listing support for LIST.", "Fixture Exchange")],
    },
  );
  assert(getRaw<unknown[]>(listing, "positiveCatalysts").length > 0, "Official listing must be classified as a positive catalyst.");

  const duplicate = await runNewsAgent(
    { symbol: "DUPE", tokenName: "Duplicate Token" },
    {
      feeds: newsFeeds,
      now,
      fetchFeed: async () => [
        item("Duplicate Token announces partnership", "DUPE partnership", "Fixture News", "https://news.example/dupe"),
        item("Duplicate Token announces partnership", "DUPE partnership copied", "Fixture News", "https://news.example/dupe"),
      ],
    },
  );
  assert(getRaw<unknown[]>(duplicate, "matchedArticles").length === 1, "Duplicate articles must count as one matched signal.");

  const unavailable = await runNewsAgent(
    { symbol: "DOWN", tokenName: "Down Token" },
    {
      feeds: newsFeeds,
      now,
      fetchFeed: async () => {
        throw new Error("source down");
      },
    },
  );
  assert(unavailable.recommendedAction === "manual_review", "Unavailable news sources must not recommend hold.");
  assert(unavailable.status === "unavailable", "Unavailable news sources must be visible in agent status.");
}

function socialMetadata(url: string, text: string, links: string[] = []) {
  return {
    url,
    title: text,
    description: text,
    reachable: true,
    links,
    text,
  };
}

function socialPost(text: string, links: string[] = []) {
  return {
    text,
    links,
    createdAt: "2026-07-05T12:00:00.000Z",
    likeCount: 10,
    replyCount: 2,
    repostCount: 1,
    viewCount: 1000,
  };
}

async function runSocialChecks() {
  const directX = await runSocialAgent(
    {
      symbol: "GOAT",
      tokenName: "Goat Token",
      websiteUrl: "https://goat.example",
      twitterUrl: "https://x.com/official_goat",
    },
    {
      now,
      fetchMetadata: async (url) => socialMetadata(url, "Goat docs audit github roadmap", ["https://x.com/official_goat"]),
      fetchSocialData: async () => ({
        providerLabel: "Fixture Social",
        account: {
          handle: "official_goat",
          bio: "Official Goat Token. Website https://goat.example. Docs and audit available.",
          createdAt: "2024-01-01T00:00:00.000Z",
          followers: 12000,
          following: 120,
          postCount: 520,
          profileUrl: "https://x.com/official_goat",
          websiteUrl: "https://goat.example",
        },
        officialPosts: [socialPost("Goat Token roadmap update docs audit github https://goat.example")],
      }),
    },
  );
  assert(getRaw<{ handle?: string }>(directX, "identity").handle === "official_goat", "User X link must be analyzed directly.");
  assert(getRaw<number>(directX, "officialAccountConfidence") >= 0.75, "Direct official X link with website match must produce high identity confidence.");

  const symbolOnly = await runSocialAgent(
    { symbol: "GOAT" },
    {
      now,
      fetchMetadata: async (url) => socialMetadata(url, "unused"),
      fetchSocialData: async () => ({
        providerLabel: "Fixture Social",
        searchPosts: [socialPost("$GOAT community update")],
      }),
    },
  );
  assert(getRaw<number>(symbolOnly, "officialAccountConfidence") < 0.35, "Symbol-only social input must keep identity confidence low.");

  const fakeOfficial = await runSocialAgent(
    {
      symbol: "GOAT",
      tokenName: "Goat Token",
      websiteUrl: "https://goat.example",
      twitterUrl: "https://x.com/goat_airdrop_claim",
    },
    {
      now,
      fetchMetadata: async (url) => socialMetadata(url, "Goat community", ["https://x.com/goat_airdrop_claim"]),
      fetchSocialData: async () => ({
        providerLabel: "Fixture Social",
        account: {
          handle: "goat_airdrop_claim",
          bio: "Official GOAT airdrop. Claim free tokens now.",
          createdAt: "2026-06-25T00:00:00.000Z",
          followers: 80,
          following: 5,
          postCount: 6,
          profileUrl: "https://x.com/goat_airdrop_claim",
          websiteUrl: "https://claim-goat.example",
        },
        officialPosts: [socialPost("Claim free GOAT airdrop, connect wallet now", ["https://claim-goat.example/connect"])],
        replies: [
          { text: "scam fake airdrop", authorCreatedAt: "2026-07-01T00:00:00.000Z" },
          { text: "scam fake airdrop", authorCreatedAt: "2026-07-01T00:00:00.000Z" },
          { text: "scam fake airdrop", authorCreatedAt: "2026-07-01T00:00:00.000Z" },
        ],
      }),
    },
  );
  assert(fakeOfficial.riskScore >= 50, "Fake official account fixture must return high social risk.");
  assert(fakeOfficial.recommendedAction === "manual_review" || fakeOfficial.recommendedAction === "avoid", "Fake official account fixture must not recommend hold.");

  const phishing = await runSocialAgent(
    {
      symbol: "PHISH",
      tokenName: "Phish Token",
      websiteUrl: "https://phish.example",
      twitterUrl: "https://x.com/phish_official",
    },
    {
      now,
      fetchMetadata: async (url) => socialMetadata(url, "Phish docs", ["https://x.com/phish_official"]),
      fetchSocialData: async () => ({
        providerLabel: "Fixture Social",
        account: {
          handle: "phish_official",
          bio: "Official Phish Token https://phish.example",
          createdAt: "2024-01-01T00:00:00.000Z",
          followers: 5000,
          following: 80,
          postCount: 300,
          profileUrl: "https://x.com/phish_official",
          websiteUrl: "https://phish.example",
        },
        officialPosts: [socialPost("Claim migration, connect wallet", ["https://phish-drainer.example/claim"])],
      }),
    },
  );
  assert(phishing.findings.some((finding) => finding.label === "Phishing and giveaway language" && (finding.severity === "critical" || finding.severity === "high")), "Phishing claim link fixture must be critical/high.");

  const noProvider = await runSocialAgent(
    {
      symbol: "NOP",
      tokenName: "No Provider Token",
      websiteUrl: "https://nop.example",
    },
    {
      now,
      fetchMetadata: async (url) => socialMetadata(url, "No Provider docs audit", []),
      fetchSocialData: async () => undefined,
    },
  );
  assert(getRaw<{ available?: boolean }>(noProvider, "engagement").available === false, "Provider-unavailable fixture must not invent engagement metrics.");
  assert(getRaw<boolean>(noProvider, "providerDataAvailable") === false, "Provider-unavailable fixture must expose missing provider data.");

  const decision = runDecisionAgent({ results: [blueChipLikeResult(), fakeOfficial] });
  assert(decision.recommendedAction === "watch" || decision.recommendedAction === "manual_review" || decision.recommendedAction === "avoid", "Decision Agent must include Social Agent as a supporting weighted signal.");
}

function blueChipLikeResult(): AgentResult {
  return {
    agent: "onchain",
    status: "complete",
    riskScore: 18,
    score: 18,
    riskLevel: "low",
    verdict: "No major onchain flags",
    summary: "Fixture low-risk onchain result.",
    findings: [{ label: "Fixture onchain clean", severity: "low", detail: "No blocker." }],
    sources: [{ label: "Fixture source", status: "connected" }],
    dataQuality: {
      mode: "live",
      connectedSources: 1,
      unavailableSources: 0,
      mockSources: 0,
      sourceCount: 1,
      reliability: 0.8,
      detail: "Fixture source.",
    },
    confidence: 0.78,
    recommendedAction: "hold",
    blockingReasons: [],
    missingData: [],
    createdAt: now.toISOString(),
  };
}

async function main() {
  await runOnchainChecks();
  await runNewsChecks();
  await runSocialChecks();

  console.log("Agent fixture checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
