import { runNewsAgent } from "../src/server/agents/news";
import { runOnchainAgent } from "../src/server/agents/onchain";
import { runDecisionAgent } from "../src/server/agents/decision";
import { buildExecutionPreview, runExecutionAgent } from "../src/server/agents/execution";
import { buildAgentResult, scoreToRiskLevel } from "../src/server/agents/shared";
import { validateAgentResult } from "../src/server/agents/schema";
import { runSocialAgent } from "../src/server/agents/social";
import { resolveTokenIdentity } from "../src/server/identity/tokenIdentity";
import { createAgentRunRecord, createX402PaymentReceipt, getStorageHealth, getX402PaymentReceiptByHeaderHash } from "../src/server/storage";
import { getCachePolicyMetadata } from "../src/server/cache/strategy";
import { getProviderTimeoutBudget, resolveProviderConflict, runProviderFallbacks } from "../src/server/providers/adapter";
import { getRuntimeModeHealth } from "../src/server/env/runtimeMode";
import { assertExternalFetchAllowed, evaluateUrlSafety } from "../src/server/security/urlSafety";
import { getPortfolioHardeningReport } from "../src/server/portfolio/hardening";
import { getPortfolioRiskSignals } from "../src/server/portfolio/riskScoring";
import { createAgentRunId, getRunPartialStatus, markRunCancelled } from "../src/server/agents/orchestrationState";
import { createAgentLog, redactSecrets } from "../src/server/observability/logging";
import { evaluateAlertThresholds } from "../src/server/observability/alerts";
import { getResultMetrics } from "../src/server/observability/metrics";
import { goldenFixtureSuite, assertGoldenScore } from "../src/server/evaluation/goldenFixtures";
import { compareReplaySnapshot, createReplaySnapshot } from "../src/server/evaluation/replay";
import { criticalFindingDoesNotLowerRisk, missingDataDoesNotIncreaseConfidence, noAgentResultRequiresManualReview, reliableSourcesDoNotLowerConfidence } from "../src/server/evaluation/properties";
import { hashSourceSnapshot } from "../src/server/storage";
import { rateLimitProfiles } from "../src/server/security/rateLimit";
import { contractAddressSchema, tokenSymbolSchema, walletAddressSchema } from "../src/server/security/inputValidation";
import { buildRiskReport, validateRiskReport } from "../src/server/scan/riskReport";
import { buildAnalysisChecks } from "../src/server/scan/tokenScan";
import { getX402RouteConfig, getX402RuntimeConfig, validateX402RuntimeConfig } from "../src/server/x402/config";
import { assertFreshX402Payment, hashPaymentHeader } from "../src/server/x402/guards";
import type { AgentResult, PortfolioSnapshot, TokenHolding } from "../src/server/types";
import { NextRequest } from "next/server";
import { POST as confirmExecution } from "../src/app/api/execute/confirm/route";
import { POST as submitExecution } from "../src/app/api/execute/submit/route";
import { POST as prepareExecution } from "../src/app/api/execute/prepare/route";
import { POST as rejectExecution } from "../src/app/api/execute/reject/route";
import { GET as getTransactionLifecycle } from "../src/app/api/execute/transactions/[hash]/route";
import { GET as listTransactionHistory } from "../src/app/api/history/transactions/route";
import {
  configureEvmSimulator,
  clearEvmSimulator,
} from "../src/server/transactions/adapters/evm";
import {
  configureStellarSimulator,
  clearStellarSimulator,
} from "../src/server/transactions/adapters/stellar";
import {
  submitTransaction,
  pollTransaction,
  expireTransactionIfStale,
  prepareTransaction,
  recordUserRejection,
  TransactionLifecycleError,
} from "../src/server/transactions/lifecycleManager";
import {
  appendLifecycleEventByName,
  createTransactionRecord,
  getTransactionRecord,
  getTransactionRecordByIdempotencyKey,
  isImmutableTerminal,
  listTransactionLifecycleEvents,
  updateTransactionRecord,
} from "../src/server/storage";
import type { TransactionLifecycleStatus } from "../src/server/types";

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
  assertAgentContract(honeypot);
  assert(honeypot.recommendedAction === "avoid", "Honeypot fixture must recommend avoid.");
  assert(honeypot.riskScore >= 75, "Honeypot fixture must produce critical risk.");
  assert(getRaw<{ simulationOverridesSecurityProvider?: boolean }>(honeypot, "simulationPrecedence").simulationOverridesSecurityProvider === true, "Simulation precedence must be exposed above security provider flags.");
  const honeypotDecision = runDecisionAgent({ results: [honeypot] });
  const honeypotReport = buildRiskReport({
    query: baseInput.contractAddress,
    requestedChain: "base",
    normalized: {
      chain: "base",
      contractAddress: baseInput.contractAddress,
      symbol: "HNY",
      name: "Honeypot Fixture",
      source: "contract_address",
    },
    results: [honeypot, honeypotDecision],
    decision: honeypotDecision,
    createdAt: now.toISOString(),
  });
  const honeypotCard = honeypotReport.agentCards.find((card) => card.agent === "onchain");
  assert(honeypotCard?.criticalFactors?.some((factor) => factor.category === "sellability"), "Critical honeypot/cannot-sell override must be exposed at the top of Contract Guard.");

  const nonContract = await runOnchainAgent(baseInput, {
    fetchContractCode: async () => ({ checked: true, deployed: false, bytecodeSize: 0, detail: "No deployed bytecode." }),
    fetchSecurity: async () => cleanSecurity(),
    fetchPairs: async () => [pair()],
    fetchCreatorActivity: creatorOk,
  });
  assert(nonContract.recommendedAction === "avoid", "An EOA or wrong-network address must recommend avoid.");
  assert(nonContract.riskScore >= 75, "An address without deployed bytecode must produce critical risk.");
  assert(getRaw<{ deployed?: boolean }>(nonContract, "contractIdentity").deployed === false, "RPC contract identity result must be exposed.");

  const lowLiquidity = await runOnchainAgent(baseInput, {
    fetchSecurity: async () => cleanSecurity({ lp_holders: [{ address: "0x5555555555555555555555555555555555555555", percent: "0.10", is_contract: "0", is_locked: "0" }] }),
    fetchPairs: async () => [pair({ liquidity: { usd: 12_000 }, volume: { h24: 8_000 }, fdv: 4_000_000, pairCreatedAt: Date.now() - 1 * 86_400_000 })],
    fetchCreatorActivity: creatorOk,
  });
  assert(lowLiquidity.riskScore >= 50, "Low liquidity fixture must produce high risk.");
  assert(lowLiquidity.recommendedAction === "manual_review" || lowLiquidity.recommendedAction === "avoid", "Low liquidity fixture must not recommend hold.");
  assert(getRaw<{ lockProvider?: { provider?: string } }>(lowLiquidity, "lp").lockProvider?.provider !== undefined, "Liquidity lock provider status must be exposed.");
  assert(getRaw<{ washVolumeSuspicion?: string }>(lowLiquidity, "marketManipulation").washVolumeSuspicion !== undefined, "Market manipulation flags must be exposed.");
  const lowLiquidityDecision = runDecisionAgent({ results: [lowLiquidity] });
  const lowLiquidityReport = buildRiskReport({
    query: baseInput.contractAddress,
    requestedChain: "base",
    normalized: {
      chain: "base",
      contractAddress: baseInput.contractAddress,
      symbol: "LOW",
      name: "Low Liquidity Fixture",
      source: "contract_address",
    },
    results: [lowLiquidity, lowLiquidityDecision],
    decision: lowLiquidityDecision,
    createdAt: now.toISOString(),
  });
  const lowLiquidityCard = lowLiquidityReport.agentCards.find((card) => card.agent === "onchain");
  assert(lowLiquidityCard?.secondaryScores?.some((score) => score.label === "Liquidity Risk"), "Contract Guard must expose liquidity subscore.");
  for (const category of ["liquidity", "taxes", "holder_concentration", "lp_lock", "market_anomaly"] as const) {
    assert(lowLiquidityCard?.factors.some((factor) => factor.category === category), `Contract Guard breakdown must expose ${category}.`);
  }
  assert(lowLiquidityCard?.factors.some((factor) => factor.label === "FDV/liquidity ratio" && typeof factor.meta?.fdvLiquidityRatio === "number"), "FDV/liquidity ratio must be visible with numeric metadata.");

  const blueChip = await runOnchainAgent(baseInput, {
    fetchSecurity: async () => cleanSecurity(),
    fetchPairs: async () => [pair()],
    fetchCreatorActivity: creatorOk,
  });
  assertAgentContract(blueChip);
  assert(blueChip.riskScore < 50, "Blue-chip/high-liquidity fixture must stay low/medium risk.");
  assert(blueChip.recommendedAction === "hold" || blueChip.recommendedAction === "watch", "Blue-chip/high-liquidity fixture must not force manual review.");
  assert(Array.isArray(getRaw<unknown[]>(blueChip, "privilegedFunctions")), "Privileged function detector must be exposed.");
  assert(getRaw<{ excludedCount?: number }>(blueChip, "holderExclusions").excludedCount !== undefined, "Holder exclusion report must be exposed.");
  const blueChipDecision = runDecisionAgent({ results: [blueChip], context: { mode: "token_scan", establishedAsset: true } });
  assert(blueChipDecision.recommendedAction !== "avoid", "Clean findings that mention checked blocker names must not create a critical blocker.");
  assert(blueChipDecision.riskScore < 50, "A clean established-asset scan must stay below high risk.");
  const emptyWalletPortfolio = agentResult({
    agent: "portfolio",
    riskScore: 75,
    verdict: "Manual review required",
    summary: "Wallet provider returned no usable holdings.",
    findings: [{ label: "Stablecoin reserve", severity: "critical", detail: "Verified stablecoin reserve is 0.0% of portfolio value." }],
    blockingReasons: ["Critical finding: Stablecoin reserve"],
    recommendedAction: "manual_review",
  });
  const connectedWalletDecision = runDecisionAgent({
    results: [blueChip, emptyWalletPortfolio],
    context: { mode: "token_scan", establishedAsset: true, userAlreadyOwnsToken: false, holdingAllocationPercent: 0 },
  });
  assert(connectedWalletDecision.riskScore === blueChipDecision.riskScore, "Empty wallet context must not change intrinsic token scan risk.");
  assert(!connectedWalletDecision.blockingReasons.some((reason) => reason.includes("portfolio")), "Portfolio blockers must not override token scan risk.");

  const ownedTokenPortfolio = agentResult({
    agent: "portfolio",
    riskScore: 68,
    verdict: "High target-token exposure",
    summary: "The scanned token represents 30% of the connected wallet.",
    findings: [{ label: "Target token exposure", severity: "high", detail: "Target token allocation is 30%." }],
    recommendedAction: "reduce_exposure",
  });
  const ownedTokenDecision = runDecisionAgent({
    results: [blueChip, ownedTokenPortfolio],
    context: { mode: "token_scan", establishedAsset: true, userAlreadyOwnsToken: true, holdingAllocationPercent: 30, stableReservePercent: 10 },
  });
  const ownedTokenWeights = getRaw<{ details?: Array<{ agent?: string; weight?: number }> }>(ownedTokenDecision, "weightedScore").details ?? [];
  assert(ownedTokenWeights.some((detail) => detail.agent === "portfolio" && (detail.weight ?? 0) > 0), "Owned-token scans must retain connected portfolio weight.");

  const partialOnchain = agentResult({
    agent: "onchain",
    riskScore: 42,
    verdict: "Partial onchain data",
    summary: "Some onchain providers were unavailable.",
    sources: [
      { label: "RPC bytecode", status: "connected", checkedAt: now.toISOString(), reliability: 0.96 },
      { label: "GoPlus token security", status: "connected", checkedAt: now.toISOString(), reliability: 0.8 },
      { label: "DexScreener token pairs", status: "unavailable", checkedAt: now.toISOString(), reliability: 0.1 },
    ],
    rawSignals: {
      contractIdentity: { checked: true, deployed: true, bytecodeSize: 128 },
      security: { honeypot: undefined, sellTax: "", hiddenOwner: undefined, ownerCanChangeBalance: undefined, mintable: undefined, pausable: undefined },
      holders: { holderCount: 0, top5Percent: 0 },
      lp: { lockProvider: { provider: "unavailable", protectedPercent: 0 } },
      market: { pairCount: 0 },
      scoreBreakdown: { holderConcentration: 42, liquidityExit: 68, marketAnomaly: 42 },
    },
    recommendedAction: "manual_review",
  });
  const partialChecks = buildAnalysisChecks(partialOnchain, false);
  for (const key of ["honeypot", "sell_tax", "ownership", "holders", "liquidity", "lp_lock", "market"]) {
    assert(partialChecks.find((check) => check.key === key)?.status === "unavailable", `Missing ${key} evidence must remain unavailable.`);
  }

  const dexOnly = await runOnchainAgent(baseInput, {
    fetchSecurity: async () => {
      throw new Error("security provider down");
    },
    fetchPairs: async () => [pair()],
    fetchCreatorActivity: async () => undefined,
  });
  assert(dexOnly.sources.some((source) => source.label === "DexScreener token pairs" && source.status === "connected"), "DEX source must work when security provider is down.");
  assert(dexOnly.sources.some((source) => source.label === "GoPlus token security" && source.status === "unavailable"), "Security provider outage must be visible.");
  const dexOnlyDecision = runDecisionAgent({ results: [dexOnly] });
  const dexOnlyReport = buildRiskReport({
    query: baseInput.contractAddress,
    requestedChain: "base",
    normalized: {
      chain: "base",
      contractAddress: baseInput.contractAddress,
      symbol: "DEX",
      name: "Dex Only Fixture",
      source: "contract_address",
    },
    results: [dexOnly, dexOnlyDecision],
    decision: dexOnlyDecision,
    createdAt: now.toISOString(),
  });
  const dexOnlyCard = dexOnlyReport.agentCards.find((card) => card.agent === "onchain");
  assert(dexOnlyCard?.factors.some((factor) => factor.label === "Security provider unavailable"), "Missing GoPlus provider must be visible in Contract Guard.");
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

function assertAgentContract(result: AgentResult) {
  const parsed = validateAgentResult(result);

  assert(parsed.success, `${result.agent} result must satisfy runtime AgentResult schema.`);
  assert(result.rawSignals?.scoreBreakdown !== undefined, `${result.agent} result must include score breakdown.`);
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
  assert(getRaw<Array<{ confirmationStatus?: string }>>(listing, "confirmationStatus").some((item) => item.confirmationStatus === "exchange_confirmed"), "Exchange listing must be exchange-confirmed.");
  assert(getRaw<unknown[]>(listing, "sourceCredibility").length > 0, "News source credibility registry must be exposed.");
  assert(getRaw<{ lowConfidenceTranslationRequiresManualReview?: boolean }>(listing, "regionalSupport").lowConfidenceTranslationRequiresManualReview === true, "News regional/multilingual support plan must be exposed.");
  assert(getRaw<{ independentSourceCount?: number }>(listing, "eventTimeline").independentSourceCount !== undefined, "News event timeline must be exposed.");

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
  assert(getRaw<unknown[]>(duplicate, "entityExtraction").length === 1, "News entity extraction must be exposed for matched articles.");

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
  assertAgentContract(unavailable);
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
  assert(getRaw<{ mutualVerificationScore?: number }>(directX, "mandatorySocialResolver").mutualVerificationScore !== undefined, "Mandatory social resolver report must be exposed.");
  assert(getRaw<{ fakeMetricsGenerated?: boolean }>(directX, "limitations").fakeMetricsGenerated === false, "Social source limitations must state fake metrics are not generated.");
  const directXDecision = runDecisionAgent({ results: [blueChipLikeResult(), directX] });
  const directXReport = buildRiskReport({
    query: "GOAT",
    requestedChain: "base",
    normalized: null,
    results: [blueChipLikeResult(), directX, directXDecision],
    decision: directXDecision,
    createdAt: now.toISOString(),
  });
  const directXCard = directXReport.agentCards.find((card) => card.agent === "social");
  assert(directXCard?.secondaryScores?.some((score) => score.label === "Social Trust"), "Social Scout must expose Social Trust subscore.");
  assert(directXCard?.secondaryScores?.some((score) => score.label === "Hype Risk"), "Social Scout must expose Hype Risk subscore.");
  for (const label of ["Official account match", "Website/social mutual verification", "Engagement quality", "Bot/shill risk", "Phishing/drainer links", "Account age and followers"]) {
    assert(directXCard?.factors.some((factor) => factor.label === label), `Social Scout breakdown must expose ${label}.`);
  }

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
  assert(getRaw<{ riskScore?: number }>(fakeOfficial, "impersonation").riskScore !== undefined, "Impersonation detector must be exposed.");

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
  assert(getRaw<{ riskyLinks?: unknown[] }>(phishing, "phishingScanner").riskyLinks !== undefined, "Phishing link scanner must be exposed.");

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
  assert(getRaw<{ botScoreStatus?: string }>(noProvider, "limitations").botScoreStatus === "unavailable", "Missing comments/replies must make bot score unavailable.");
  const noProviderDecision = runDecisionAgent({ results: [blueChipLikeResult(), noProvider] });
  const noProviderReport = buildRiskReport({
    query: "NOP",
    requestedChain: "base",
    normalized: null,
    results: [blueChipLikeResult(), noProvider, noProviderDecision],
    decision: noProviderDecision,
    createdAt: now.toISOString(),
  });
  const noProviderCard = noProviderReport.agentCards.find((card) => card.agent === "social");
  assert(noProviderCard?.factors.some((factor) => factor.label === "Social metrics unavailable" && factor.meta?.fakeMetricsGenerated === false), "Social provider outage must show unavailable metrics without fake bot/follower scores.");

  const decision = runDecisionAgent({ results: [blueChipLikeResult(), fakeOfficial] });
  assert(decision.recommendedAction === "watch" || decision.recommendedAction === "manual_review" || decision.recommendedAction === "avoid", "Decision Agent must include Social Agent as a supporting weighted signal.");
}

function blueChipLikeResult(): AgentResult {
  return agentResult({
    agent: "onchain",
    riskScore: 18,
    verdict: "No major onchain flags",
    summary: "Fixture low-risk onchain result.",
    findings: [{ label: "Fixture onchain clean", severity: "low", detail: "No blocker." }],
    recommendedAction: "hold",
    confidence: 0.78,
  });
}

function agentResult(input: Partial<AgentResult> & Pick<AgentResult, "agent" | "riskScore" | "verdict" | "summary">): AgentResult {
  const riskScore = input.riskScore;

  return buildAgentResult({
    agent: input.agent,
    score: input.score ?? riskScore,
    verdict: input.verdict,
    summary: input.summary,
    findings: input.findings ?? [],
    sources: input.sources ?? [{ label: `${input.agent} fixture source`, status: "connected", checkedAt: now.toISOString(), reliability: 0.8 }],
    confidence: input.confidence ?? 0.72,
    recommendedAction: input.recommendedAction ?? (riskScore >= 75 ? "avoid" : riskScore >= 50 ? "manual_review" : "hold"),
    blockingReasons: input.blockingReasons,
    missingData: input.missingData,
    rawSignals: input.rawSignals,
  });
}

function unavailableAgentResult(agent: AgentResult["agent"]): AgentResult {
  return agentResult({
    agent,
    status: "unavailable",
    riskScore: 42,
    verdict: `${agent} unavailable`,
    summary: "Fixture unavailable source.",
    findings: [{ label: "Missing source", severity: "medium", detail: "Provider unavailable." }],
    sources: [{ label: `${agent} fixture source`, status: "unavailable", checkedAt: now.toISOString(), reliability: 0.1 }],
    confidence: 0.18,
    recommendedAction: "manual_review",
    missingData: [{ field: "fixture source", reason: "Provider unavailable.", impact: "medium", requiredFor: "fixture coverage" }],
  });
}

async function runDecisionChecks() {
  const noResults = runDecisionAgent({ results: [] });
  assert(noResults.recommendedAction === "manual_review", "Decision with no agent results must return manual_review.");

  const onchainCritical = runDecisionAgent({
    results: [
      agentResult({
        agent: "onchain",
        riskScore: 92,
        verdict: "Critical onchain risk",
        summary: "Honeypot cannot sell fixture.",
        findings: [{ label: "Critical contract flags", severity: "critical", detail: "Honeypot and cannot sell." }],
        blockingReasons: ["Critical finding: Honeypot"],
        recommendedAction: "avoid",
      }),
      agentResult({ agent: "news", riskScore: 12, verdict: "Positive news", summary: "Listing catalyst.", rawSignals: { positiveCatalysts: [{ title: "Listing" }] } }),
      agentResult({ agent: "social", riskScore: 14, verdict: "Positive community", summary: "Community active." }),
    ],
  });
  assert(onchainCritical.recommendedAction === "avoid" || onchainCritical.recommendedAction === "manual_review", "Onchain critical must force avoid/manual_review.");
  assert(getRaw<{ deterministicCore?: boolean }>(onchainCritical, "deterministicCore").deterministicCore === true, "Decision Agent must expose deterministic core audit.");
  assert(Array.isArray(getRaw<unknown[]>(onchainCritical, "criticalBlockerMatrix")), "Decision Agent must expose critical blocker matrix.");
  assert(getRaw<{ conflictPenalty?: number }>(onchainCritical, "confidenceFormula").conflictPenalty !== undefined, "Decision confidence formula must expose conflict penalty.");

  const lowCoverage = runDecisionAgent({
    results: [unavailableAgentResult("onchain"), unavailableAgentResult("news"), unavailableAgentResult("social")],
  });
  assert(lowCoverage.recommendedAction !== "hold", "Low/no data coverage must not return hold.");

  const highExposure = runDecisionAgent({
    context: {
      mode: "holding_review",
      userAlreadyOwnsToken: true,
      holdingAllocationPercent: 48,
      stableReservePercent: 4,
    },
    results: [
      agentResult({
        agent: "portfolio",
        riskScore: 68,
        verdict: "High portfolio exposure",
        summary: "Wallet has high allocation to one risky token.",
        findings: [{ label: "Largest holding", severity: "high", detail: "Risky token is 48% of wallet." }],
        rawSignals: { portfolioRisk: { largestHoldingPercent: 48, stableReservePercent: 4 } },
        recommendedAction: "reduce_exposure",
      }),
      agentResult({
        agent: "onchain",
        riskScore: 64,
        verdict: "High onchain risk",
        summary: "Liquidity exit risk elevated.",
        findings: [{ label: "Liquidity", severity: "high", detail: "Low liquidity." }],
        recommendedAction: "manual_review",
      }),
    ],
  });
  assert(highExposure.recommendedAction === "reduce_exposure" || highExposure.recommendedAction === "swap_to_stable", "High exposure plus high risk must recommend reduce/swap.");

  const explanation = getRaw<{ evidence?: string[]; missingData?: string[] }>(highExposure, "explanation");
  assert(Array.isArray(explanation.evidence) && explanation.evidence.length > 0, "Decision output must include top reasons/evidence.");

  const missingDataDecision = runDecisionAgent({ results: [blueChipLikeResult()] });
  const missingData = getRaw<{ missingData?: string[] }>(missingDataDecision, "explanation").missingData;
  assert(Array.isArray(missingData) && missingData.length > 0, "Decision output must include missing data when specialist agents are absent.");

  const invalidDecision = runDecisionAgent({
    results: [
      {
        ...blueChipLikeResult(),
        findings: [{ label: "Invalid finding", severity: "low", detail: "Missing normalized contract fields." }],
      } as AgentResult,
    ],
  });
  assert(invalidDecision.recommendedAction === "manual_review", "Invalid specialist output must force manual review.");
  assert(getRaw<string[]>(invalidDecision, "invalidAgentOutput").length === 1, "Invalid specialist output must be exposed in raw signals.");
  assert(invalidDecision.sources.some((source) => source.errorCode === "invalid_agent_result"), "Invalid specialist output must be visible in sources.");
}

async function runExecutionChecks() {
  const defaultPreview = buildExecutionPreview({
    action: "reduce_exposure",
    fromToken: "MEME",
    toToken: "USDC",
    percent: 10,
    riskScore: 40,
    estimatedValueUsd: 100,
    network: "GOAT Network",
    simulationStatus: "passed",
  });
  assert(defaultPreview.policy?.autoExecute === false, "Auto-execute must default to false.");
  assert(defaultPreview.requiresApproval === false, "Quote-missing trade action must not prepare wallet approval.");
  assert(defaultPreview.executionReady === false, "Quote-missing trade action must not be executable.");
  assert(defaultPreview.blockedReason?.includes("Live quote provider"), "Quote-missing trade action must expose blocked reason.");
  assert(defaultPreview.audit?.serverCanSign === false, "Server signing must remain disabled.");

  const quotedPreview = buildExecutionPreview({
    action: "reduce_exposure",
    fromToken: "MEME",
    toToken: "USDC",
    percent: 10,
    riskScore: 40,
    estimatedValueUsd: 100,
    network: "GOAT Network",
    simulationStatus: "passed",
    quoteAvailable: true,
    expectedOutputAmount: 98,
  });
  assert(quotedPreview.requiresApproval === true && quotedPreview.executionReady === true, "Live quote plus passed policy must allow approval-only execution.");
  assert(quotedPreview.approvalRisk?.existingAllowanceCheck === "required", "Approval risk analysis must require allowance check for trade actions.");
  assert(quotedPreview.lifecycle?.status === "prepared", "Execution preview must expose prepared lifecycle status.");

  const policyBlocked = buildExecutionPreview({
    action: "reduce_exposure",
    fromToken: "MEME",
    toToken: "USDC",
    percent: 90,
    riskScore: 40,
    estimatedValueUsd: 100,
    network: "GOAT Network",
  });
  assert(policyBlocked.requiresApproval === false, "Policy violation must not prepare a wallet approval.");
  assert(Boolean(policyBlocked.blockedReason), "Policy violation must expose blocked reason.");

  const manualReview = buildExecutionPreview({
    action: "manual_review",
    fromToken: "MEME",
    toToken: "USDC",
    percent: 10,
    riskScore: 60,
  });
  assert(manualReview.requiresApproval === false && manualReview.action === "no_action", "Manual review action must not prepare a transaction.");

  const executionResult = runExecutionAgent({
    action: "swap_to_stable",
    fromToken: "MEME",
    toToken: "USDC",
    percent: 10,
    riskScore: 40,
    estimatedValueUsd: 100,
    network: "GOAT Network",
    simulationStatus: "passed",
  });
  assert(getRaw<{ preview?: unknown }>(executionResult, "preview") !== undefined, "Execution Agent must expose preview raw signal.");

  const failedSimulationResponse = await confirmExecution(
    new Request("http://localhost/api/execute/confirm", {
      method: "POST",
      body: JSON.stringify({
        walletAddress: "0xabc",
        txHash: `0x${"a".repeat(64)}`,
        userApproved: true,
        simulationStatus: "failed",
      }),
    }),
  );
  assert(failedSimulationResponse.status === 403, "Simulation failure must block confirmation.");

  const highRiskMissingSimulationResponse = await confirmExecution(
    new Request("http://localhost/api/execute/confirm", {
      method: "POST",
      body: JSON.stringify({
        walletAddress: "0xabc",
        txHash: `0x${"c".repeat(64)}`,
        userApproved: true,
        action: "reduce_exposure",
        riskScore: 60,
        simulationStatus: "pending",
      }),
    }),
  );
  assert(highRiskMissingSimulationResponse.status === 403, "High-risk execution confirmation must require passed simulation.");

  const walletMismatchResponse = await confirmExecution(
    new Request("http://localhost/api/execute/confirm", {
      method: "POST",
      body: JSON.stringify({
        decisionWalletAddress: "0xabc",
        walletAddress: "0xdef",
        txHash: `0x${"d".repeat(64)}`,
        userApproved: true,
      }),
    }),
  );
  assert(walletMismatchResponse.status === 403, "Confirm must reject wallet mismatch.");

  const invalidConfirmResponse = await confirmExecution(
    new Request("http://localhost/api/execute/confirm", {
      method: "POST",
      body: JSON.stringify({
        walletAddress: "0xabc",
        txHash: "not-a-tx",
        userApproved: true,
      }),
    }),
  );
  assert(invalidConfirmResponse.status === 400, "Confirm must reject invalid tx hash.");

  const validConfirmResponse = await confirmExecution(
    new Request("http://localhost/api/execute/confirm", {
      method: "POST",
      body: JSON.stringify({
        decisionId: "decision_fixture",
        walletAddress: "0xabc",
        txHash: `0x${"b".repeat(64)}`,
        userApproved: true,
        network: "GOAT Network",
        action: "reduce_exposure",
        asset: "MEME",
        valueUsd: 25,
        simulationStatus: "passed",
        policyAllowed: true,
      }),
    }),
  );
  assert(validConfirmResponse.status === 200, "Confirm must accept valid hash plus explicit user approval.");

  const duplicateConfirmResponse = await confirmExecution(
    new Request("http://localhost/api/execute/confirm", {
      method: "POST",
      body: JSON.stringify({
        decisionId: "decision_fixture",
        walletAddress: "0xabc",
        txHash: `0x${"b".repeat(64)}`,
        userApproved: true,
      }),
    }),
  );
  assert(duplicateConfirmResponse.status === 200, "Confirm must remain idempotent for re-verification of an externally-broadcast hash.");
  const duplicateConfirmJson = await duplicateConfirmResponse.json();
  assert(duplicateConfirmJson.pendingVerification === true, "Re-confirming an externally-broadcast hash must report pendingVerification until on-chain verification succeeds.");

  const runRecord = createAgentRunRecord({
    walletAddress: "0xabc",
    mode: "token_scan",
    inputSnapshot: { symbol: "MEME", chain: "base" },
    targetToken: { symbol: "MEME", chain: "base", riskScore: 60 },
    results: [blueChipLikeResult(), executionResult],
  });
  assert(runRecord.mode === "token_scan", "Agent run history must store run mode.");
  assert(runRecord.inputSnapshot?.symbol === "MEME", "Agent run history must store input snapshot.");
  assert(Array.isArray(runRecord.sourceStatuses) && runRecord.sourceStatuses.length > 0, "Agent run history must store source status snapshots.");
  assert(Array.isArray(runRecord.inputSnapshot?.resultSnapshots), "Agent run history must store result raw/source snapshots.");
  assert(
    Array.isArray(runRecord.inputSnapshot?.resultSnapshots) && typeof runRecord.inputSnapshot.resultSnapshots[0]?.sourceSnapshotHash === "string",
    "Agent run history must store immutable source snapshot hash.",
  );
}

async function runReadinessChecks() {
  assert(scoreToRiskLevel(12) === "low", "Scoring helper must map low risk consistently.");
  assert(scoreToRiskLevel(52) === "high", "Scoring helper must map high risk consistently.");
  assert(validateAgentResult(blueChipLikeResult()).success, "Fixture AgentResult must pass runtime schema.");
  assert(getRuntimeModeHealth().liveModeUsesMockData === false, "Runtime mode health must state live mode does not use mock data.");

  const unsafeUrl = evaluateUrlSafety("http://127.0.0.1/admin");
  assert(unsafeUrl.safe === false && unsafeUrl.issues.includes("private or localhost target blocked"), "URL safety guard must block localhost/private targets.");
  assert(assertExternalFetchAllowed("file:///etc/passwd").allowed === false, "External fetch sandbox must reject file protocol.");
  assert(assertExternalFetchAllowed("https://example.com/feed", "application/octet-stream", 12).allowed === false, "External fetch sandbox must reject unsupported content type.");
  assert(walletAddressSchema.safeParse("0x0000000000000000000000000000000000000001").success, "Wallet validation must accept EVM addresses.");
  assert(contractAddressSchema.safeParse("not-a-contract").success === false, "Contract validation must reject invalid addresses.");
  assert(tokenSymbolSchema.safeParse("A".repeat(40)).success === false, "Symbol validation must enforce length.");
  assert(rateLimitProfiles.tokenScan.namespace !== rateLimitProfiles.executionPrepare.namespace, "Rate limit profiles must be separated by run type.");

  const symbolOnlyIdentity = resolveTokenIdentity({ symbol: "GOAT" });
  assert(symbolOnlyIdentity.confidenceLabel === "low", "Symbol-only identity must remain low confidence.");
  assert(Boolean(symbolOnlyIdentity.identityGraph), "Resolved identity must expose an identity graph.");
  assert((symbolOnlyIdentity.symbolCollision as { risk?: string }).risk === "high", "Collision-prone symbol-only identity must expose high collision risk.");

  const linkedIdentity = resolveTokenIdentity({
    symbol: "SAFE",
    tokenName: "Safe Token",
    chain: "base",
    contractAddress: "0x3333333333333333333333333333333333333333",
    websiteUrl: "https://safe.example",
    twitterUrl: "https://x.com/safe",
    dexScreenerPairUrl: "https://dexscreener.com/base/fixture",
  });
  assert(linkedIdentity.confidenceLabel === "high", "Contract plus chain and official links must produce high identity confidence.");

  const spamHolding: TokenHolding = {
    tokenAddress: "0x9999999999999999999999999999999999999999",
    symbol: "CLAIM",
    name: "Claim Airdrop",
    chainId: "base",
    isVerified: false,
    balance: 1,
    priceUsd: 0.01,
    valueUsd: 0.01,
    allocationPercent: 0.01,
    riskScore: 70,
    riskLevel: "high",
    signals: {
      scamRisk: 80,
      websiteTrustRisk: 70,
      contractRisk: 70,
      whaleSellRisk: 40,
      liquidityRisk: 80,
      xSentimentRisk: 70,
      holderConcentrationRisk: 70,
      priceVolatilityRisk: 50,
      portfolioExposureRisk: 1,
    },
  };
  const stableHolding: TokenHolding = {
    tokenAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    symbol: "USDC",
    name: "USD Coin",
    chainId: "base",
    isVerified: true,
    balance: 100,
    priceUsd: 1,
    valueUsd: 100,
    allocationPercent: 99.99,
    riskScore: 8,
    riskLevel: "low",
    signals: {
      scamRisk: 5,
      websiteTrustRisk: 5,
      contractRisk: 5,
      whaleSellRisk: 5,
      liquidityRisk: 5,
      xSentimentRisk: 5,
      holderConcentrationRisk: 5,
      priceVolatilityRisk: 2,
      portfolioExposureRisk: 5,
    },
  };
  const portfolio: PortfolioSnapshot = {
    walletAddress: "0xabc",
    nativeBalance: 0,
    nativeSymbol: "ETH",
    dayChangePercent: 0,
    dayChangeUsd: 0,
    totalValueUsd: 100.01,
    riskScore: 12,
    createdAt: now.toISOString(),
    holdings: [spamHolding, stableHolding],
  };
  const portfolioSignals = getPortfolioRiskSignals(portfolio.holdings);
  const hardening = getPortfolioHardeningReport(portfolio, portfolioSignals, "connected");
  assert(hardening.dustFilter.spamHoldingCount === 1, "Portfolio hardening must detect dust/spam holdings.");
  assert(hardening.fakeStablecoins.length === 0, "Verified chain-specific stablecoin must not be flagged fake.");
  assert(hardening.chainReadiness.executionReadiness === "gas_missing", "Portfolio hardening must expose native gas readiness.");
  assert(hardening.riskDriverBreakdown.some((item) => item.key === "chain_readiness"), "Portfolio hardening must expose deterministic risk driver breakdown.");

  const storageHealth = getStorageHealth();
  for (const table of ["wallets", "agent_runs", "agent_results", "recommendations", "user_rules", "approvals", "transactions", "x402_payment_receipts", "token_identities", "source_snapshots"]) {
    assert(storageHealth.schema?.tables.includes(table), `Storage schema contract must include ${table}.`);
  }

  const unresolvedScan = await (await import("../src/server/scan/tokenScan")).runTokenScan("not-a-contract", "base");
  assert(unresolvedScan.dataQuality?.mockSources === 0, "Unresolved token scan must not use mock data.");
  assert(unresolvedScan.dataQuality?.mode === "unavailable", "Unresolved token scan must report unavailable data.");
  assert(unresolvedScan.riskReport?.verdict === "manual_review", "Unresolved token scan must produce a conservative manual-review risk report.");
  assert(unresolvedScan.riskReport && validateRiskReport(unresolvedScan.riskReport).success, "Unresolved token scan risk report must satisfy runtime schema.");

  const onchainFixture = blueChipLikeResult();
  const newsFixture = unavailableAgentResult("news");
  const socialFixture = unavailableAgentResult("social");
  const decisionFixture = runDecisionAgent({ results: [onchainFixture, newsFixture, socialFixture] });
  const riskReport = buildRiskReport({
    query: "0x3333333333333333333333333333333333333333",
    requestedChain: "base",
    normalized: {
      chain: "base",
      contractAddress: "0x3333333333333333333333333333333333333333",
      symbol: "FIX",
      name: "Fixture Token",
      source: "contract_address",
    },
    results: [onchainFixture, newsFixture, socialFixture, decisionFixture],
    decision: decisionFixture,
    createdAt: now.toISOString(),
  });
  assert(validateRiskReport(riskReport).success, "Risk report mapper must satisfy runtime schema.");
  assert(riskReport.agentCards.some((card) => card.displayName === "Contract Guard"), "Risk report must expose UI-ready Contract Guard card.");
  assert(riskReport.agentCards.some((card) => card.factors.length > 0), "Risk report must expose score factors.");

  const newsCardFixture = agentResult({
    agent: "news",
    riskScore: 34,
    verdict: "News review needed",
    summary: "Fixture news result with catalysts and source credibility.",
    findings: [{ label: "Positive catalysts", severity: "low", detail: "One listing catalyst." }],
    rawSignals: {
      matchedArticles: [{ title: "Fixture Token listing", source: "Fixture Exchange", identityMatchConfidence: 0.82 }],
      positiveCatalysts: [{ type: "positive_catalyst", severity: "low", source: "Fixture Exchange" }],
      negativeCatalysts: [],
      sourceCredibility: [{ source: "Fixture Exchange", historicalReliability: 0.78 }],
      eventTimeline: { independentSourceCount: 1, lastSeen: now.toISOString() },
      sourceReliability: 0.78,
      identityMatchConfidence: 0.82,
    },
  });
  const portfolioCardFixture = agentResult({
    agent: "portfolio",
    riskScore: 46,
    verdict: "Portfolio exposure watch",
    summary: "Target token exposure is visible.",
    findings: [{ label: "Target token exposure", severity: "medium", detail: "Target is 18% of wallet." }],
    rawSignals: {
      targetTokenExposurePercent: 18,
      portfolioRisk: {
        concentrationRisk: 38,
        liquidityExitRisk: 44,
        stableReserveRisk: 42,
        assetQualityRisk: 34,
        chainExecutionRisk: 28,
        largestHoldingPercent: 32,
        top3HoldingPercent: 72,
        stableReservePercent: 24,
        lowLiquidityExposurePercent: 18,
        unknownPriceExposurePercent: 4,
        unverifiedExposurePercent: 9,
        hasNativeGasToken: true,
        dominantChainPercent: 58,
      },
    },
  });
  const richDecision = runDecisionAgent({ results: [onchainFixture, newsCardFixture, socialFixture, portfolioCardFixture] });
  const richRiskReport = buildRiskReport({
    query: "0x3333333333333333333333333333333333333333",
    requestedChain: "base",
    normalized: {
      chain: "base",
      contractAddress: "0x3333333333333333333333333333333333333333",
      symbol: "FIX",
      name: "Fixture Token",
      source: "contract_address",
    },
    results: [onchainFixture, newsCardFixture, socialFixture, portfolioCardFixture, richDecision],
    decision: richDecision,
    createdAt: now.toISOString(),
  });
  const newsCard = richRiskReport.agentCards.find((card) => card.agent === "news");
  assert(newsCard?.secondaryScores?.some((score) => score.label === "News Signal"), "News Oracle must expose News Signal subscore.");
  assert(newsCard?.factors.some((factor) => factor.label === "Positive catalyst score"), "News Oracle must expose positive catalyst percentage factor.");
  assert(newsCard?.factors.some((factor) => factor.label === "Source reliability"), "News Oracle must expose source reliability factor.");
  assert(newsCard?.factors.some((factor) => factor.label === "Matched article list"), "News Oracle must expose simplified article list factor.");
  const portfolioCard = richRiskReport.agentCards.find((card) => card.agent === "portfolio");
  assert(portfolioCard?.secondaryScores?.some((score) => score.label === "Token Exposure"), "Portfolio Keeper must expose token exposure subscore.");
  assert(portfolioCard?.factors.some((factor) => factor.label === "Stable reserve"), "Portfolio Keeper must expose stable reserve factor.");
  assert(portfolioCard?.factors.some((factor) => factor.label === "Native gas readiness"), "Portfolio Keeper must expose native gas readiness factor.");
  const decisionCard = richRiskReport.agentCards.find((card) => card.agent === "decision");
  assert(decisionCard?.secondaryScores?.some((score) => score.label === "Final Buy Risk"), "Decision Core must expose final buy risk subscore.");
  assert(decisionCard?.factors.some((factor) => factor.label === "Critical blocker matrix"), "Decision Core must expose critical blocker matrix factor.");
  assert(decisionCard?.factors.some((factor) => factor.label === "What would change this decision"), "Decision Core must expose what-would-change factor.");

  const runId = createAgentRunId("fixture_run");
  assert(runId.startsWith("fixture_run_"), "Agent run id helper must create stable-prefixed run ids.");
  const partialStatus = getRunPartialStatus([unavailableAgentResult("news"), blueChipLikeResult()]);
  assert(partialStatus.partial === true && partialStatus.userVisible === true, "Orchestration partial status must be user-visible when an agent is unavailable.");
  assert(markRunCancelled(runId).status === "cancelled", "Run cancellation contract must expose cancelled status.");

  const log = createAgentLog(blueChipLikeResult(), "Bearer sk-test API_KEY=secret");
  assert(log.agent === "onchain" && log.sourceCount > 0, "Structured logging must include agent and source count.");
  assert(!redactSecrets("Bearer sk-abc123456789012345 api_key=secret").includes("abc123456789012345"), "Secret sanitizer must redact bearer/API key values.");

  const metrics = getResultMetrics([blueChipLikeResult(), unavailableAgentResult("news")]);
  assert(metrics.providerFailureRate > 0 && metrics.agentSuccessRate > 0, "Metrics must expose provider failure and success rates.");
  assert(evaluateAlertThresholds({ providerFailureRate: 50, manualReviewRate: 10 }).providerFailureSpike === true, "Alert threshold must flag provider failure spikes.");

  assert(goldenFixtureSuite.includes("honeypot"), "Golden fixture suite must include honeypot case.");
  assert(assertGoldenScore("honeypot", 88), "Regression snapshot must accept expected honeypot score range.");
  assert(noAgentResultRequiresManualReview(), "Property test must enforce no result -> manual_review.");
  assert(criticalFindingDoesNotLowerRisk(blueChipLikeResult(), agentResult({
    agent: "onchain",
    riskScore: 82,
    verdict: "Critical",
    summary: "Critical fixture.",
    findings: [{ label: "Critical fixture", severity: "critical", detail: "Critical blocker." }],
    recommendedAction: "avoid",
  })), "Critical finding property must not lower risk.");
  assert(missingDataDoesNotIncreaseConfidence(blueChipLikeResult(), unavailableAgentResult("news")), "Missing data property must not increase confidence.");
  assert(reliableSourcesDoNotLowerConfidence(unavailableAgentResult("news"), blueChipLikeResult()), "Reliable source property must not lower confidence when conflict-free.");

  const snapshotHash = hashSourceSnapshot({ sources: blueChipLikeResult().sources, rawSignals: blueChipLikeResult().rawSignals });
  const replaySnapshot = createReplaySnapshot(blueChipLikeResult(), snapshotHash);
  assert(compareReplaySnapshot(replaySnapshot, blueChipLikeResult()).compatible, "Replay snapshot must compare compatible deterministic results.");
}

async function runTransactionLifecycleChecks() {
  clearEvmSimulator();
  clearStellarSimulator();

  const evmHash = `0x${"1".repeat(64)}`;
  const stellarHash = `${"a".repeat(64)}`;
  const stellarWallet = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

  configureEvmSimulator("evm", "GOAT Network", { submitOutcome: "submitted", pollOutcome: "confirmed" });
  const evmSubmitted = await submitTransaction({
    chainFamily: "evm",
    network: "GOAT Network",
    walletAddress: "0xabc",
    sourceAccount: "0xabc",
    decisionId: "decision_lifecycle",
    decisionAction: "reduce_exposure",
    asset: "MEME",
    valueUsd: 25,
    simulationStatus: "passed",
    policyStatus: { allowed: true, violations: [] },
    expectedEffects: [{ kind: "swap", fromToken: "MEME", toToken: "USDC" }],
    userApproved: true,
    signedPayload: evmHash,
    idempotencyKey: "idem_evm_success",
  });
  assert(evmSubmitted.outcome === "submitted" && evmSubmitted.transaction.lifecycleStatus === "submitted", "EVM submit must persist a submitted lifecycle.");
  assert(evmSubmitted.transaction.explorerUrl?.includes("tx"), "EVM submit must attach an explorer URL.");
  assert(evmSubmitted.result.idempotent === false, "Fresh EVM submit must not be flagged as idempotent.");
  assert(evmSubmitted.transaction.submittedAt !== undefined, "EVM submit must record a submittedAt timestamp.");
  const evmEvents = listTransactionLifecycleEvents(evmSubmitted.transaction.hash);
  assert(evmEvents.some((event) => event.event === "prepared") && evmEvents.some((event) => event.event === "submitted"), "EVM submit must append prepared and submitted lifecycle events.");

  const evmPoll = await pollTransaction(evmSubmitted.transaction.hash);
  assert(evmPoll.transaction.lifecycleStatus === "confirmed" && evmPoll.terminalReached === true, "EVM poll-to-confirmed must mark the transaction confirmed.");
  assert(listTransactionLifecycleEvents(evmPoll.transaction.hash).some((event) => event.event === "confirmed"), "EVM poll-to-confirmed must append a confirmed event.");
  assert(evmPoll.transaction.terminalAt !== undefined, "EVM confirmed transactions must record a terminalAt timestamp.");

  assert(isImmutableTerminal("confirmed"), "Confirmed lifecycle must be considered immutable terminal.");
  assert(isImmutableTerminal("failed") && isImmutableTerminal("replaced") && isImmutableTerminal("expired") && isImmutableTerminal("user_rejected"), "All terminal lifecycle states must be flagged immutable.");

  const evmIdempotent = await submitTransaction({
    chainFamily: "evm",
    network: "GOAT Network",
    walletAddress: "0xabc",
    sourceAccount: "0xabc",
    decisionId: "decision_lifecycle",
    decisionAction: "reduce_exposure",
    asset: "MEME",
    valueUsd: 25,
    simulationStatus: "passed",
    policyStatus: { allowed: true, violations: [] },
    userApproved: true,
    signedPayload: evmHash,
    idempotencyKey: "idem_evm_success",
  });
  assert(evmIdempotent.outcome === "ignored_duplicate" && evmIdempotent.result.idempotent === true && evmIdempotent.result.reuseReason === "idempotency_key", "Duplicate EVM submit with same idempotency key must short-circuit without overwriting history.");

  const evmDuplicateHash = await submitTransaction({
    chainFamily: "evm",
    network: "GOAT Network",
    walletAddress: "0xabc",
    sourceAccount: "0xabc",
    decisionId: "decision_lifecycle_other",
    asset: "MEME",
    userApproved: true,
    signedPayload: evmHash,
  });
  assert(evmDuplicateHash.outcome === "ignored_duplicate" && evmDuplicateHash.result.reuseReason === "duplicate_hash", "Duplicate EVM submit with same hash and different key must reject without overwriting.");
  assert(listTransactionLifecycleEvents(evmHash).some((event) => event.event === "duplicate_rejected"), "Duplicate hash submit must append a duplicate_rejected lifecycle event.");

  configureEvmSimulator("evm", "GOAT Network", { submitOutcome: "submitted", pollOutcome: "failed" });
  const evmFailedHash = `0x${"2".repeat(64)}`;
  const evmFailed = await submitTransaction({
    chainFamily: "evm",
    network: "GOAT Network",
    walletAddress: "0xabc",
    sourceAccount: "0xabc",
    decisionId: "decision_lifecycle_failed",
    asset: "MEME",
    userApproved: true,
    signedPayload: evmFailedHash,
    idempotencyKey: "idem_evm_failed",
  });
  const evmFailedPoll = await pollTransaction(evmFailed.transaction.hash);
  assert(evmFailedPoll.transaction.lifecycleStatus === "failed", "EVM poll-to-failed must mark the transaction failed.");
  assert(evmFailedPoll.transaction.failureReason !== undefined, "Failed EVM transactions must record a failureReason.");

  configureEvmSimulator("evm", "GOAT Network", { submitOutcome: "submitted", pollOutcome: "replaced" });
  const evmReplacedHash = `0x${"3".repeat(64)}`;
  const evmReplaced = await submitTransaction({
    chainFamily: "evm",
    network: "GOAT Network",
    walletAddress: "0xabc",
    sourceAccount: "0xabc",
    decisionId: "decision_lifecycle_replaced",
    asset: "MEME",
    userApproved: true,
    signedPayload: evmReplacedHash,
    idempotencyKey: "idem_evm_replaced",
  });
  const evmReplacedPoll = await pollTransaction(evmReplaced.transaction.hash);
  assert(evmReplacedPoll.transaction.lifecycleStatus === "replaced", "EVM poll-to-replaced must mark the transaction replaced.");

  configureEvmSimulator("evm", "GOAT Network", { submitOutcome: "submitted", pollOutcome: "expired" });
  const evmExpiredHash = `0x${"4".repeat(64)}`;
  const evmExpired = await submitTransaction({
    chainFamily: "evm",
    network: "GOAT Network",
    walletAddress: "0xabc",
    sourceAccount: "0xabc",
    decisionId: "decision_lifecycle_expired",
    asset: "MEME",
    userApproved: true,
    signedPayload: evmExpiredHash,
    idempotencyKey: "idem_evm_expired",
  });
  const evmExpiredPoll = await pollTransaction(evmExpired.transaction.hash);
  assert(evmExpiredPoll.transaction.lifecycleStatus === "expired", "EVM poll-to-expired must mark the transaction expired.");

  configureEvmSimulator("evm", "GOAT Network", { submitOutcome: "submitted", pollOutcome: "pending" });
  const evmPendingHash = `0x${"5".repeat(64)}`;
  const evmPending = await submitTransaction({
    chainFamily: "evm",
    network: "GOAT Network",
    walletAddress: "0xabc",
    sourceAccount: "0xabc",
    decisionId: "decision_lifecycle_pending",
    asset: "MEME",
    userApproved: true,
    signedPayload: evmPendingHash,
    idempotencyKey: "idem_evm_pending",
  });
  const evmPendingPoll = await pollTransaction(evmPending.transaction.hash);
  assert(evmPendingPoll.transaction.lifecycleStatus === "pending" && evmPendingPoll.terminalReached === false, "EVM poll-to-pending must remain non-terminal.");
  const expiry = await expireTransactionIfStale(evmPendingPoll.transaction.hash, { ttlMs: 1, now: () => new Date(Date.now() + 60_000) });
  assert(expiry.expired === true && expiry.transaction?.lifecycleStatus === "expired", "Stale pending transactions must transition to expired when TTL elapses.");

  configureEvmSimulator("evm", "GOAT Network", { submitOutcome: "rejected" });
  const evmRejected = await submitTransaction({
    chainFamily: "evm",
    network: "GOAT Network",
    walletAddress: "0xabc",
    sourceAccount: "0xabc",
    asset: "MEME",
    userApproved: true,
    signedPayload: `0x${"6".repeat(64)}`,
    idempotencyKey: "idem_evm_rejected",
  });
  assert(evmRejected.outcome === "terminally_recorded", "EVM rejected submit must be persisted as a terminally_recorded submission_failed.");
  assert(evmRejected.transaction.lifecycleStatus === "failed", "EVM rejected submit must persist the failed lifecycle, not leave the record at prepared.");
  assert(evmRejected.transaction.failureReason?.includes("rejected") ?? false, "EVM rejected submit must record the rejected reason on the failed record.");
  assert(listTransactionLifecycleEvents(evmRejected.transaction.hash).some((event) => event.event === "submission_failed"), "EVM rejected submit must append a submission_failed lifecycle event.");
  configureEvmSimulator("evm", "GOAT Network", { submitOutcome: "submitted", pollOutcome: "confirmed" });

  configureEvmSimulator("evm", "GOAT Network", { submitOutcome: "submitted", pollOutcome: "confirmed" });

  // ---- Stellar lifecycle ----
  configureStellarSimulator("stellar", "stellar-testnet", { submitOutcome: "submitted", pollOutcome: "confirmed" });
  const stellarSubmitted = await submitTransaction({
    chainFamily: "stellar",
    network: "stellar-testnet",
    walletAddress: stellarWallet,
    sourceAccount: stellarWallet,
    decisionId: "decision_stellar_success",
    asset: "GOAT",
    expectedEffects: [{ kind: "publish_risk", method: "publish_risk", contractAddress: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA" }],
    userApproved: true,
    signedPayload: stellarHash,
    idempotencyKey: "idem_stellar_success",
  });
  assert(stellarSubmitted.outcome === "submitted", "Stellar submit must persist submitted lifecycle.");
  assert(stellarSubmitted.transaction.explorerUrl?.includes("stellar.expert"), "Stellar submit must attach a stellar.expert explorer URL.");
  const stellarConfirmed = await pollTransaction(stellarSubmitted.transaction.hash);
  assert(stellarConfirmed.transaction.lifecycleStatus === "confirmed", "Stellar poll-to-confirmed must mark the transaction confirmed.");

  configureStellarSimulator("stellar", "stellar-testnet", { submitOutcome: "submitted", pollOutcome: "failed" });
  const stellarFailedHash = `${"b".repeat(64)}`;
  const stellarFailed = await submitTransaction({
    chainFamily: "stellar",
    network: "stellar-testnet",
    walletAddress: stellarWallet,
    sourceAccount: stellarWallet,
    asset: "GOAT",
    userApproved: true,
    signedPayload: stellarFailedHash,
    idempotencyKey: "idem_stellar_failed",
  });
  const stellarFailedPoll = await pollTransaction(stellarFailed.transaction.hash);
  assert(stellarFailedPoll.transaction.lifecycleStatus === "failed", "Stellar poll-to-failed must mark the transaction failed.");

  configureStellarSimulator("stellar", "stellar-testnet", { submitOutcome: "submitted", pollOutcome: "replaced" });
  const stellarReplacedHash = `${"c".repeat(64)}`;
  const stellarReplaced = await submitTransaction({
    chainFamily: "stellar",
    network: "stellar-testnet",
    walletAddress: stellarWallet,
    sourceAccount: stellarWallet,
    asset: "GOAT",
    userApproved: true,
    signedPayload: stellarReplacedHash,
    idempotencyKey: "idem_stellar_replaced",
  });
  const stellarReplacedPoll = await pollTransaction(stellarReplaced.transaction.hash);
  assert(stellarReplacedPoll.transaction.lifecycleStatus === "replaced", "Stellar poll-to-replaced must mark the transaction replaced.");

  configureStellarSimulator("stellar", "stellar-testnet", { submitOutcome: "submitted", pollOutcome: "expired" });
  const stellarExpiredHash = `${"d".repeat(64)}`;
  const stellarExpired = await submitTransaction({
    chainFamily: "stellar",
    network: "stellar-testnet",
    walletAddress: stellarWallet,
    sourceAccount: stellarWallet,
    asset: "GOAT",
    userApproved: true,
    signedPayload: stellarExpiredHash,
    idempotencyKey: "idem_stellar_expired",
  });
  const stellarExpiredPoll = await pollTransaction(stellarExpired.transaction.hash);
  assert(stellarExpiredPoll.transaction.lifecycleStatus === "expired", "Stellar poll-to-expired must mark the transaction expired.");

  configureStellarSimulator("stellar", "stellar-testnet", { submitOutcome: "rejected" });
  const stellarRejected = await submitTransaction({
    chainFamily: "stellar",
    network: "stellar-testnet",
    walletAddress: stellarWallet,
    sourceAccount: stellarWallet,
    asset: "GOAT",
    userApproved: true,
    signedPayload: `${"e".repeat(64)}`,
    idempotencyKey: "idem_stellar_rejected",
  });
  assert(stellarRejected.outcome === "terminally_recorded", "Stellar rejected submit must be persisted as a terminally_recorded submission_failed.");
  assert(stellarRejected.transaction.lifecycleStatus === "failed", "Stellar rejected submit must persist the failed lifecycle, not leave the record at prepared.");
  assert(stellarRejected.transaction.failureReason?.includes("rejected") ?? false, "Stellar rejected submit must record the rejected reason on the failed record.");
  assert(listTransactionLifecycleEvents(stellarRejected.transaction.hash).some((event) => event.event === "submission_failed"), "Stellar rejected submit must append a submission_failed lifecycle event.");

  configureStellarSimulator("stellar", "stellar-testnet", { submitOutcome: "submitted", pollOutcome: "confirmed" });
  clearStellarSimulator();

  try {
    await submitTransaction({
      chainFamily: "evm",
      network: "stellar-testnet",
      walletAddress: stellarWallet,
      sourceAccount: stellarWallet,
      asset: "GOAT",
      userApproved: true,
      signedPayload: stellarWallet,
    });
    throw new Error("family/network mismatch should have thrown");
  } catch (error) {
    assert(error instanceof TransactionLifecycleError && error.code === "network_chain_family_mismatch", "Submit must reject network/family mismatches.");
  }

  // ---- submission_failed is a terminal persisted state, not a thrown error ----
  configureEvmSimulator("evm", "GOAT Network", { submitOutcome: "rejected" });
  const submissionFailedHash = `0x${"7".repeat(64)}`;
  const submissionFailed = await submitTransaction({
    chainFamily: "evm",
    network: "GOAT Network",
    walletAddress: "0xabc",
    sourceAccount: "0xabc",
    asset: "MEME",
    userApproved: true,
    signedPayload: submissionFailedHash,
    idempotencyKey: "idem_evm_submission_failed",
  });
  assert(submissionFailed.outcome === "terminally_recorded", "Rejected RPC submit must persist as terminally_recorded outcome.");
  assert(submissionFailed.transaction.lifecycleStatus === "failed", "Submission rejection must persist the failed lifecycle, not leave the record at prepared.");
  assert(submissionFailed.result.status === "failed", "Submission report must surface failed status to callers.");
  assert(Boolean(submissionFailed.transaction.failureReason), "Failed submission must record a failureReason tied to the RPC rejection.");
  assert(listTransactionLifecycleEvents(submissionFailed.transaction.hash).some((event) => event.event === "submission_failed"), "Failed submissions must append a submission_failed lifecycle event.");
  assert(listTransactionLifecycleEvents(submissionFailed.transaction.hash).some((event) => event.event === "prepared"), "Failed submissions must still retain the prepared lifecycle event for audit.");
  configureEvmSimulator("evm", "GOAT Network", { submitOutcome: "submitted", pollOutcome: "confirmed" });

  // ---- user_rejected is a real lifecycle path, not an orphan event ----
  const userRejectedHash = `0x${"8".repeat(64)}`;
  configureEvmSimulator("evm", "GOAT Network", { submitOutcome: "submitted", pollOutcome: "confirmed" });
  const userRejectedPrep = await submitTransaction({
    chainFamily: "evm",
    network: "GOAT Network",
    walletAddress: "0xabc",
    sourceAccount: "0xabc",
    asset: "MEME",
    userApproved: true,
    signedPayload: userRejectedHash,
    idempotencyKey: "idem_evm_user_rejected",
  });
  assert(userRejectedPrep.transaction.lifecycleStatus === "submitted", "User-rejected fixture requires a fresh submitted record.");
  const userRejected = await recordUserRejection(userRejectedHash, { walletAddress: "0xabc", reason: "User clicked reject in wallet." });
  assert(userRejected.lifecycleStatus === "user_rejected", "recordUserRejection must mark the transaction as user_rejected.");
  assert(isImmutableTerminal(userRejected.lifecycleStatus as TransactionLifecycleStatus), "user_rejected must be flagged as immutable terminal.");
  assert(Boolean(userRejected.failureReason), "user_rejected must record a human-readable failureReason.");
  assert(listTransactionLifecycleEvents(userRejectedHash).some((event) => event.event === "user_rejected"), "user_rejected transactions must append a user_rejected lifecycle event.");

  // Re-rejecting an already terminal transaction is a no-op
  const reRejected = await recordUserRejection(userRejectedHash, { walletAddress: "0xabc" });
  assert(reRejected.lifecycleStatus === "user_rejected", "Re-rejecting a terminal user_rejected transaction must remain terminal.");

  // ---- prepareTransaction is idempotent across repeated POSTs with the same key ----
  const prepared = prepareTransaction({
    chainFamily: "evm",
    network: "GOAT Network",
    walletAddress: "0xabc",
    sourceAccount: "0xabc",
    asset: "MEME",
    decisionId: "decision_prepare_idempotent",
    idempotencyKey: "idem_prepare_idempotent",
  });
  assert(!prepared.idempotent && prepared.created === true, "First prepare must create a new prepared record.");

  const preparedAgain = prepareTransaction({
    chainFamily: "evm",
    network: "GOAT Network",
    walletAddress: "0xabc",
    sourceAccount: "0xabc",
    asset: "MEME",
    decisionId: "decision_prepare_idempotent",
    idempotencyKey: "idem_prepare_idempotent",
  });
  assert(preparedAgain.idempotent && preparedAgain.created === false, "Second prepare with the same idempotency key must be idempotent.");
  assert(preparedAgain.transaction.hash === prepared.transaction.hash, "Idempotent prepare must return the same transaction record.");
  assert(prepared.transaction.lifecycleStatus === "prepared", "Prepare must persist the prepared lifecycle.");
  assert(listTransactionLifecycleEvents(prepared.transaction.hash).some((event) => event.event === "prepared"), "Prepared transactions must append a prepared lifecycle event.");

  const prepareResponse = await prepareExecution(
    new Request("http://localhost/api/execute/prepare", {
      method: "POST",
      body: JSON.stringify({
        walletAddress: "0xabc",
        chainFamily: "evm",
        network: "GOAT Network",
        decisionId: "decision_prepare_route",
        asset: "MEME",
        estimatedValueUsd: 50,
        simulationStatus: "passed",
        fromToken: "MEME",
        toToken: "USDC",
        percent: 10,
        riskScore: 40,
        idemKey: "idem_prepare_route",
        idempotencyKey: "idem_prepare_route",
      }),
    }),
  );
  assert(prepareResponse.status === 200, "Prepare API must accept a valid input.");
  const prepareJson = await prepareResponse.json();
  assert(prepareJson.prepare?.created === true, "First prepare API call must create a new prepared record.");
  assert(typeof prepareJson.prepare?.transaction?.hash === "string", "Prepare API must expose the prepared transaction hash.");
  assert(prepareJson.lifecycle?.status === "prepared", "Prepare API lifecycle status must be prepared.");
  assert(typeof prepareJson.lifecycle?.idempotencyKey === "string", "Prepare API response must include the idempotency key.");

  const duplicatePrepareResponse = await prepareExecution(
    new Request("http://localhost/api/execute/prepare", {
      method: "POST",
      body: JSON.stringify({
        walletAddress: "0xabc",
        chainFamily: "evm",
        network: "GOAT Network",
        decisionId: "decision_prepare_route",
        asset: "MEME",
        estimatedValueUsd: 50,
        simulationStatus: "passed",
        fromToken: "MEME",
        toToken: "USDC",
        percent: 10,
        riskScore: 40,
        idempotencyKey: "idem_prepare_route",
      }),
    }),
  );
  const duplicatePrepareJson = await duplicatePrepareResponse.json();
  assert(duplicatePrepareResponse.status === 200, "Duplicate prepare must respond 200 (idempotent).");
  assert(duplicatePrepareJson.prepare?.idempotent === true && duplicatePrepareJson.prepare?.created === false, "Duplicate prepare API call must be idempotent.");
  assert(duplicatePrepareJson.prepare?.transaction?.hash === prepareJson.prepare?.transaction?.hash, "Duplicate prepare API call must reuse the prepared record.");

  // ---- reject API persists user_rejected terminal state ----
  const rejectHash = `0x${"a".repeat(63)}1`;
  const rejectCreated = createTransactionRecord({
    hash: rejectHash,
    type: "approval",
    asset: "MEME",
    valueUsd: 0,
    status: "submitted",
    lifecycleStatus: "submitted",
    chainFamily: "evm",
    network: "GOAT Network",
    walletAddress: "0xabc",
    userApproved: true,
  });
  assert(rejectCreated.lifecycleStatus === "submitted", "Rejected fixture requires an existing submitted record.");

  const rejectResponse = await rejectExecution(
    new Request("http://localhost/api/execute/reject", {
      method: "POST",
      body: JSON.stringify({
        txHash: rejectHash,
        walletAddress: "0xabc",
        reason: "User clicked reject in wallet.",
        source: "wallet",
      }),
    }),
  );
  assert(rejectResponse.status === 200, "Reject API must record user_rejected for known hashes.");
  const rejectJson = await rejectResponse.json();
  assert(rejectJson.status === "user_rejected", "Reject API must expose user_rejected status.");
  assert(getTransactionRecord(rejectHash)?.lifecycleStatus === "user_rejected", "Reject API must persist user_rejected terminal state in storage.");

  const unknownRejectResponse = await rejectExecution(
    new Request("http://localhost/api/execute/reject", {
      method: "POST",
      body: JSON.stringify({
        txHash: `0x${"b".repeat(63)}2`,
        walletAddress: "0xabc",
      }),
    }),
  );
  assert(unknownRejectResponse.status === 404, "Reject API must reject unknown transaction hashes.");

  const mismatchedRejectResponse = await rejectExecution(
    new Request("http://localhost/api/execute/reject", {
      method: "POST",
      body: JSON.stringify({
        txHash: rejectHash,
        walletAddress: "0xdef",
        reason: "Mismatched wallet cannot reject.",
      }),
    }),
  );
  assert(mismatchedRejectResponse.status === 403, "Reject API must reject mismatched wallet addresses.");

  // ---- confirm endpoint route surfaces pending verification when on-chain verifier has no terminal answer ----
  // Use a fresh network with an explicit pending simulator so the test is deterministic.
  configureEvmSimulator("evm", "ethereum", { pollOutcome: "pending" });
  const confirmPendingHash = `0x${"c".repeat(63)}3`;
  const confirmPending = await confirmExecution(
    new Request("http://localhost/api/execute/confirm", {
      method: "POST",
      body: JSON.stringify({
        walletAddress: "0xabc",
        txHash: confirmPendingHash,
        network: "ethereum",
        userApproved: true,
        action: "reduce_exposure",
        asset: "MEME",
        valueUsd: 25,
        simulationStatus: "passed",
        policyAllowed: true,
      }),
    }),
  );
  assert(confirmPending.status === 200, "Confirm API must record the externally broadcast hash and verify on-chain.");
  const confirmPendingJson = await confirmPending.json();
  assert(confirmPendingJson.pendingVerification === true, "Confirm must report pendingVerification when the on-chain verifier cannot confirm yet.");
  assert(confirmPendingJson.transaction?.lifecycleStatus === "pending" || confirmPendingJson.transaction?.lifecycleStatus === "submitted", "Confirm must record a non-terminal lifecycle when verification is still pending.");
  clearEvmSimulator();

  // Append a manual user_rejected event and ensure new hash is flagged
  appendLifecycleEventByName(`0x${"f".repeat(64)}`, "user_rejected", { reason: "User clicked reject in wallet." });
  assert(listTransactionLifecycleEvents(`0x${"f".repeat(64)}`).some((event) => event.event === "user_rejected"), "Lifecycle event store must keep manual user_rejected events.");

  // ---- Stellar terminal user_rejected E2E integration coverage ----
  const stellarRejectedHash = `${"a".repeat(63)}b`;
  const stellarRejectedWallet = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
  configureStellarSimulator("stellar", "stellar-testnet", { submitOutcome: "submitted", pollOutcome: "confirmed" });
  const stellarRejectedPrep = await submitTransaction({
    chainFamily: "stellar",
    network: "stellar-testnet",
    walletAddress: stellarRejectedWallet,
    sourceAccount: stellarRejectedWallet,
    asset: "GOAT",
    userApproved: true,
    signedPayload: stellarRejectedHash,
    idempotencyKey: "idem_stellar_user_rejected_e2e",
  });
  assert(stellarRejectedPrep.transaction.lifecycleStatus === "submitted", "Stellar user_rejected fixture requires a fresh submitted record.");
  const stellarRejectedLifecycle = await recordUserRejection(stellarRejectedHash, { walletAddress: stellarRejectedWallet, reason: "User clicked reject in Stellar wallet." });
  assert(stellarRejectedLifecycle.lifecycleStatus === "user_rejected", "Stellar recordUserRejection must mark the transaction as user_rejected.");
  assert(isImmutableTerminal(stellarRejectedLifecycle.lifecycleStatus as TransactionLifecycleStatus), "Stellar user_rejected must be flagged as immutable terminal.");
  assert(listTransactionLifecycleEvents(stellarRejectedHash).some((event) => event.event === "user_rejected"), "Stellar user_rejected transactions must append a user_rejected lifecycle event.");

  const stellarRejectApi = await rejectExecution(
    new Request("http://localhost/api/execute/reject", {
      method: "POST",
      body: JSON.stringify({
        txHash: stellarRejectedHash,
        walletAddress: stellarRejectedWallet,
        reason: "Stellar wallet UI cancelled.",
        source: "wallet",
      }),
    }),
  );
  assert(stellarRejectApi.status === 200, "Reject API must accept Stellar user_rejected for known hashes.");
  const stellarRejectJson = await stellarRejectApi.json();
  assert(stellarRejectJson.status === "user_rejected", "Reject API response must surface user_rejected for Stellar hashes.");
  assert(getTransactionRecord(stellarRejectedHash)?.lifecycleStatus === "user_rejected", "Reject API must persist user_rejected terminal state for Stellar hashes in storage.");
  clearStellarSimulator();

  const txMissing = (() => {
    try {
      const recorded = getTransactionRecord(`0x${"9".repeat(64)}`);
      return recorded;
    } catch {
      return undefined;
    }
  })();
  assert(txMissing === undefined, "Unknown hash must return no transaction record.");

  // ---- API route level coverage ----
  const submitResponse = await submitExecution(
    new Request("http://localhost/api/execute/submit", {
      method: "POST",
      body: JSON.stringify({
        chainFamily: "stellar",
        network: "stellar-testnet",
        walletAddress: stellarWallet,
        signedPayload: `${"7".repeat(64)}`,
        asset: "GOAT",
        decisionId: "decision_route_stellar",
        userApproved: true,
        idempotencyKey: "idem_route_stellar",
      }),
    }),
  );
  assert(submitResponse.status === 200, "Stellar submit API must accept valid Stellar payloads.");
  const submitJson = await submitResponse.json();
  assert(submitJson.transaction.chainFamily === "stellar", "Submit API must persist chain family.");

  const stellarHash2 = `${"7".repeat(64)}`;
  const stellarHash2Lower = stellarHash2.toLowerCase();
  const wrongFamilyResponse = await submitExecution(
    new Request("http://localhost/api/execute/submit", {
      method: "POST",
      body: JSON.stringify({
        chainFamily: "evm",
        network: "stellar-testnet",
        walletAddress: stellarWallet,
        signedPayload: stellarHash2Lower,
        asset: "GOAT",
        userApproved: true,
        idempotencyKey: "idem_route_wrong_family",
      }),
    }),
  );
  assert(wrongFamilyResponse.status === 400, "Submit must reject when chain family does not match network.");

  const wrongWalletFormat = await submitExecution(
    new Request("http://localhost/api/execute/submit", {
      method: "POST",
      body: JSON.stringify({
        chainFamily: "evm",
        network: "GOAT Network",
        walletAddress: "not-an-address",
        signedPayload: `0x${"a".repeat(64)}`,
        asset: "MEME",
        userApproved: true,
      }),
    }),
  );
  assert(wrongWalletFormat.status === 400, "Submit must reject invalid wallets.");

  const evmMismatchedSourceWallet = `0x${"a".repeat(40)}`;
  const evmMismatchedSourceOther = `0x${"d".repeat(40)}`;
  const evmMismatchedSource = await submitExecution(
    new Request("http://localhost/api/execute/submit", {
      method: "POST",
      body: JSON.stringify({
        chainFamily: "evm",
        network: "GOAT Network",
        walletAddress: evmMismatchedSourceWallet,
        sourceAccount: evmMismatchedSourceOther,
        signedPayload: `0x${"b".repeat(64)}`,
        asset: "MEME",
        userApproved: true,
      }),
    }),
  );
  assert(evmMismatchedSource.status === 403, "Submit must reject EVM source/wallet mismatches.");

  // Confirm API chain-family validation
  const stellarConfirmCollision = await confirmExecution(
    new Request("http://localhost/api/execute/confirm", {
      method: "POST",
      body: JSON.stringify({
        walletAddress: stellarWallet,
        chainFamily: "stellar",
        txHash: stellarHash2,
        userApproved: true,
      }),
    }),
  );
  assert(stellarConfirmCollision.status === 200, "Confirm must accept a Stellar hash when chainFamily=stellar.");

  const evmConfirmCollision = await confirmExecution(
    new Request("http://localhost/api/execute/confirm", {
      method: "POST",
      body: JSON.stringify({
        walletAddress: stellarWallet,
        chainFamily: "evm",
        txHash: stellarHash2,
        userApproved: true,
      }),
    }),
  );
  assert(evmConfirmCollision.status === 400, "Confirm must reject a Stellar hash when chainFamily=evm.");

  // Poll endpoint
  const pollRoute = await getTransactionLifecycle(
    new NextRequest(`http://localhost/api/execute/transactions/${evmSubmitted.transaction.hash}`, { method: "GET" }),
    { params: Promise.resolve({ hash: evmSubmitted.transaction.hash }) },
  );
  assert(pollRoute.status === 200, "Status endpoint must accept known hashes.");
  const pollJson = await pollRoute.json();
  assert(Array.isArray(pollJson.events) && pollJson.events.length > 0, "Status endpoint must include lifecycle events.");
  assert(pollJson.transaction.lifecycleStatus === "confirmed", "Status endpoint must reflect the latest lifecycle state.");

  const missingRoute = await getTransactionLifecycle(
    new NextRequest(`http://localhost/api/execute/transactions/${"9".repeat(64)}`, { method: "GET" }),
    { params: Promise.resolve({ hash: "9".repeat(64) }) },
  );
  assert(missingRoute.status === 404, "Status endpoint must return 404 for unknown hashes.");

  const richHistory = await listTransactionHistory(new NextRequest(`http://localhost/api/history/transactions?walletAddress=0xabc`, { method: "GET" }));
  assert(richHistory.status === 200, "History endpoint must respond 200.");
  const historyJson = await richHistory.json();
  assert(Array.isArray(historyJson) && historyJson.length > 0, "History endpoint must return enriched records.");
  assert(historyJson.every((record: { events?: unknown[] }) => Array.isArray(record.events)), "History records must include their lifecycle events.");
  assert(historyJson.every((record: { explorerUrl?: string }) => typeof record.explorerUrl === "string"), "History records must include an explorer URL.");

  // Storage invariants
  const lookupByHash = getTransactionRecord(evmSubmitted.transaction.hash);
  assert(lookupByHash?.hash === evmSubmitted.transaction.hash, "Storage must retrieve transaction records by hash.");
  const lookupByKey = getTransactionRecordByIdempotencyKey("0xabc", "idem_evm_success");
  assert(lookupByKey?.idempotencyKey === "idem_evm_success", "Storage must look up records by idempotency key.");
  assert(updateTransactionRecord(evmSubmitted.transaction.hash, { valueUsd: 999 })?.valueUsd === 999, "Update should mutate tracking fields without touching status.");

  clearEvmSimulator();
}

async function runProviderReliabilityChecks() {
  assert(getProviderTimeoutBudget("portfolio") === 8_000, "Portfolio provider timeout budget must be 8s.");
  assert(getProviderTimeoutBudget("onchain") === 12_000, "Onchain provider timeout budget must be 12s.");
  assert(getProviderTimeoutBudget("news") === 8_000, "News provider timeout budget must be 8s.");
  assert(getProviderTimeoutBudget("social") === 12_000, "Social provider timeout budget must be 12s.");
  assert(getProviderTimeoutBudget("decision") === 3_000, "Decision timeout budget must be 3s.");
  assert(getProviderTimeoutBudget("execution") === 20_000, "Execution prepare timeout budget must be 20s.");

  const fallback = await runProviderFallbacks([
    {
      kind: "news",
      provider: "primary",
      label: "Primary fixture provider",
      fallbackRank: 0,
      retries: 0,
      run: async () => {
        throw new Error("provider 429 rate limit");
      },
    },
    {
      kind: "news",
      provider: "fallback",
      label: "Fallback fixture provider",
      fallbackRank: 1,
      retries: 0,
      run: async () => ({ ok: true }),
    },
  ]);
  assert(fallback.ok === true, "Provider fallback chain must return fallback result when primary fails.");
  assert(fallback.fallbackRank === 1, "Provider fallback result must expose fallback rank.");
  assert(fallback.confidenceCap < 0.9, "Fallback provider result must cap confidence.");
  assert(fallback.source.provider === "fallback", "Fallback provider must be visible in source metadata.");

  const sellabilityConflict = resolveProviderConflict({
    kind: "sellability",
    primaryRisk: 10,
    secondaryRisk: 96,
    primaryLabel: "GoPlus",
    secondaryLabel: "Tenderly simulation",
  });
  assert(sellabilityConflict.riskScore === 96 && sellabilityConflict.winner === "Tenderly simulation", "Simulation cannot-sell must override clean security flags.");

  const liquidityConflict = resolveProviderConflict({
    kind: "liquidity",
    primaryRisk: 25,
    secondaryRisk: 70,
    primaryLabel: "DexScreener liquidity",
    secondaryLabel: "Aggregator quote liquidity",
  });
  assert(liquidityConflict.riskScore === 70, "Liquidity conflicts must use the conservative risk.");
}

function runCachePolicyChecks() {
  const portfolio = getCachePolicyMetadata("portfolio");
  const onchain = getCachePolicyMetadata("onchain");
  const news = getCachePolicyMetadata("news");
  const social = getCachePolicyMetadata("social");
  const execution = getCachePolicyMetadata("execution");

  assert(portfolio.ttlClass === "short" && portfolio.seconds <= 60, "Portfolio balances must use short TTL.");
  assert(onchain.ttlClass === "medium" && onchain.criticalFreshnessVisible, "Security flags must use medium TTL with freshness visible.");
  assert(news.ttlClass === "long" && social.ttlClass === "long", "News/social cache policy must use longer TTL.");
  assert(execution.scope === "no-store", "Execution planning must not be shared-cacheable.");
}

function runX402Checks() {
  const previous = {
    X402_PAY_TO: process.env.X402_PAY_TO,
    X402_PRICE_USD: process.env.X402_PRICE_USD,
    X402_NETWORK: process.env.X402_NETWORK,
    X402_FACILITATOR_URL: process.env.X402_FACILITATOR_URL,
    CDP_API_KEY_ID: process.env.CDP_API_KEY_ID,
    CDP_API_KEY_SECRET: process.env.CDP_API_KEY_SECRET,
  };

  process.env.X402_PAY_TO = "0x0000000000000000000000000000000000000001";
  process.env.X402_PRICE_USD = "$0.01";
  process.env.X402_NETWORK = "eip155:84532";
  process.env.X402_FACILITATOR_URL = "https://x402.org/facilitator";

  const config = getX402RuntimeConfig();
  const validation = validateX402RuntimeConfig(config);
  const routeConfig = getX402RouteConfig(config);

  assert(validation.ok, `x402 config should validate in fixture: ${validation.issues.join(", ")}`);
  assert(config.protectedResource === "/api/x402/deep-scan", "x402 protected resource must be the premium deep scan endpoint.");
  assert(Array.isArray(routeConfig.accepts), "x402 route config must expose payment requirements.");
  assert(routeConfig.accepts[0]?.payTo === config.payTo, "x402 route config must bind the expected recipient.");
  assert(routeConfig.accepts[0]?.network === config.network, "x402 route config must bind the expected network.");

  const request = new Request("http://localhost/api/x402/deep-scan?query=GOAT&chain=base", {
    headers: { "PAYMENT-SIGNATURE": "fixture-payment-signature" },
  });
  const guard = assertFreshX402Payment({
    request,
    requestBody: { query: "GOAT", chain: "base" },
    config,
  });

  assert(guard.ok, "Fresh x402 payment signature must pass idempotency guard.");
  const receipt = createX402PaymentReceipt({
    requestId: guard.requestId,
    paymentHeaderHash: guard.paymentHeaderHash,
    network: config.network,
    asset: config.asset,
    amount: config.priceUsd,
    priceUsd: config.priceUsd,
    payTo: config.payTo,
    facilitatorUrl: config.facilitatorUrl,
    protectedResource: config.protectedResource,
    requestBodyHash: guard.requestBodyHash,
    verificationStatus: "verified",
  });

  assert(receipt.id.startsWith("x402_"), "x402 payment receipts must use x402 ids.");
  assert(getX402PaymentReceiptByHeaderHash(hashPaymentHeader("fixture-payment-signature"))?.id === receipt.id, "x402 receipts must be retrievable by payment header hash.");

  const duplicate = assertFreshX402Payment({
    request,
    requestBody: { query: "GOAT", chain: "base" },
    config,
  });

  assert(!duplicate.ok && duplicate.status === 409, "Duplicate x402 payment signature must be rejected before premium work runs.");

  process.env.X402_PRICE_USD = "0.01";
  const invalid = validateX402RuntimeConfig(getX402RuntimeConfig());
  assert(!invalid.ok && invalid.issues.some((issue) => issue.includes("X402_PRICE_USD")), "x402 price must keep dollar-prefixed format.");

  process.env.X402_PRICE_USD = "$0.01";
  process.env.X402_NETWORK = "eip155:8453";
  const invalidMainnetFacilitator = validateX402RuntimeConfig(getX402RuntimeConfig());
  assert(
    !invalidMainnetFacilitator.ok && invalidMainnetFacilitator.issues.some((issue) => issue.includes("Base mainnet")),
    "Base mainnet must reject the testnet-only facilitator.",
  );

  process.env.X402_FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";
  delete process.env.CDP_API_KEY_ID;
  delete process.env.CDP_API_KEY_SECRET;
  const invalidCdpAuth = validateX402RuntimeConfig(getX402RuntimeConfig());
  assert(!invalidCdpAuth.ok && invalidCdpAuth.issues.some((issue) => issue.includes("CDP_API_KEY_ID")), "CDP facilitator must require both API credentials.");

  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function main() {
  await runOnchainChecks();
  await runNewsChecks();
  await runSocialChecks();
  await runDecisionChecks();
  await runExecutionChecks();
  await runTransactionLifecycleChecks();
  await runReadinessChecks();
  await runProviderReliabilityChecks();
  runCachePolicyChecks();
  runX402Checks();

  console.log("Agent fixture checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
