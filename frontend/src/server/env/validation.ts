type EnvCheck = {
  key: string;
  configured: boolean;
  visibility: "server" | "public";
  detail: string;
};

const serverEnvKeys = [
  "GOLDRUSH_API_KEY",
  "COVALENT_API_KEY",
  "GOPLUS_API_KEY",
  "GOPLUS_APP_KEY",
  "GOPLUS_APP_SECRET",
  "ALCHEMY_API_KEY",
  "GOAT_RPC_URL",
  "X402_PAY_TO",
  "X402_PRICE_USD",
  "X402_NETWORK",
  "X402_FACILITATOR_URL",
  "X402_ASSET",
  "CDP_API_KEY_ID",
  "CDP_API_KEY_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const publicEnvKeys = ["NEXT_PUBLIC_GOAT_RPC_URL", "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"] as const;

function isX402Ready() {
  const baseConfigReady = Boolean(process.env.X402_PAY_TO && process.env.X402_PRICE_USD && process.env.X402_NETWORK && process.env.X402_FACILITATOR_URL);
  const usesCdpFacilitator = process.env.X402_FACILITATOR_URL?.includes("api.cdp.coinbase.com");

  return baseConfigReady && (!usesCdpFacilitator || Boolean(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET));
}

export function getEnvHealth() {
  const goPlusReady = Boolean(process.env.GOPLUS_API_KEY || (process.env.GOPLUS_APP_KEY && process.env.GOPLUS_APP_SECRET));
  const portfolioReady = Boolean(process.env.GOAT_RPC_URL || process.env.GOLDRUSH_API_KEY || process.env.COVALENT_API_KEY || process.env.ALCHEMY_API_KEY);
  const x402Ready = isX402Ready();
  const checks: EnvCheck[] = [
    ...serverEnvKeys.map((key) => ({
      key,
      configured: Boolean(process.env[key]),
      visibility: "server" as const,
      detail: process.env[key] ? "Configured server-side." : "Missing; dependent source should report unavailable.",
    })),
    ...publicEnvKeys.map((key) => ({
      key,
      configured: Boolean(process.env[key]),
      visibility: "public" as const,
      detail: process.env[key] ? "Configured as public client config." : "Missing public fallback config.",
    })),
  ];

  const configuredLiveSources = [
    Boolean(process.env.GOAT_RPC_URL),
    Boolean(process.env.GOLDRUSH_API_KEY),
    Boolean(process.env.COVALENT_API_KEY),
    Boolean(process.env.ALCHEMY_API_KEY),
    goPlusReady,
  ].filter(Boolean);

  return {
    checks,
    liveSourceCount: configuredLiveSources.length,
    status: configuredLiveSources.length > 0 ? "partial" : "unavailable",
    mockFallbacksEnabled: false,
    realDataReadiness: {
      portfolio: portfolioReady,
      onchain: goPlusReady,
      news: true,
      social: true,
      execution: true,
      x402: x402Ready,
    },
    detail:
      configuredLiveSources.length > 0
        ? "At least one live data source is configured. Missing sources must stay transparent in UI."
        : "No live API source is configured. App returns unavailable states instead of mock confidence.",
  };
}

export function getAgentReadiness() {
  const portfolioReady = Boolean(process.env.GOAT_RPC_URL || process.env.GOLDRUSH_API_KEY || process.env.COVALENT_API_KEY || process.env.ALCHEMY_API_KEY);
  const onchainReady = Boolean(process.env.GOPLUS_API_KEY || (process.env.GOPLUS_APP_KEY && process.env.GOPLUS_APP_SECRET));
  const x402Ready = isX402Ready();
  const newsReady = true;
  const socialProviderReady = Boolean(
    process.env.SOCIAL_DATA_PROVIDER_URL ||
      process.env.APIFY_TOKEN ||
      process.env.TAVILY_API_KEY ||
      process.env.X_BEARER_TOKEN,
  );

  return {
    portfolio: {
      status: portfolioReady ? "partial" : "unavailable",
      detail: portfolioReady ? "GOAT RPC or at least one live portfolio provider is configured." : "No live portfolio balance provider is configured.",
    },
    onchain: {
      status: onchainReady ? "partial" : "unavailable",
      detail: onchainReady
        ? "DexScreener is public and GoPlus credentials are configured for token security checks."
        : "DexScreener is public; GoPlus security checks remain unavailable until credentials are configured.",
    },
    news: {
      status: newsReady ? "live" : "unavailable",
      detail: "RSS-based news sources are available without API keys.",
    },
    social: {
      status: "partial",
      detail: socialProviderReady
        ? "A social data provider is configured for account, post, reply, engagement or search-based ingestion."
        : "V1 metadata-only mode is active: website and public social links are checked, but follower, reply, engagement and bot scores are marked unavailable instead of fabricated.",
    },
    decision: {
      status: "live",
      detail: "Decision Agent is deterministic and uses submitted agent results plus source coverage.",
    },
    execution: {
      status: "live",
      detail: "Execution Agent uses local user rules and approval-only transaction planning.",
    },
    x402: {
      status: x402Ready ? "live" : "unavailable",
      detail: x402Ready
        ? "GOAT premium deep scan is protected by x402 payment configuration."
        : "x402 payment env is incomplete; premium deep scan remains locked for production.",
    },
  };
}
