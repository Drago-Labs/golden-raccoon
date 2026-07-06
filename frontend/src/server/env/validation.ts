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
  "ALCHEMY_API_KEY",
  "GOAT_RPC_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const publicEnvKeys = ["NEXT_PUBLIC_GOAT_RPC_URL"] as const;

export function getEnvHealth() {
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

  const requiredForLiveMvp = ["GOLDRUSH_API_KEY", "COVALENT_API_KEY", "GOPLUS_API_KEY"];
  const configuredLiveSources = requiredForLiveMvp.filter((key) => Boolean(process.env[key]));

  return {
    checks,
    liveSourceCount: configuredLiveSources.length,
    status: configuredLiveSources.length > 0 ? "partial" : "unavailable",
    mockFallbacksEnabled: false,
    realDataReadiness: {
      portfolio: Boolean(process.env.GOLDRUSH_API_KEY ?? process.env.COVALENT_API_KEY ?? process.env.ALCHEMY_API_KEY),
      onchain: Boolean(process.env.GOPLUS_API_KEY) || true,
      news: true,
      social: false,
      execution: true,
    },
    detail:
      configuredLiveSources.length > 0
        ? "At least one live data source is configured. Missing sources must stay transparent in UI."
        : "No live API source is configured. App returns unavailable states instead of mock confidence.",
  };
}

export function getAgentReadiness() {
  const portfolioReady = Boolean(process.env.GOLDRUSH_API_KEY ?? process.env.COVALENT_API_KEY ?? process.env.ALCHEMY_API_KEY);
  const onchainReady = true;
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
      detail: portfolioReady ? "At least one live portfolio provider is configured." : "No live portfolio balance provider is configured.",
    },
    onchain: {
      status: onchainReady ? "partial" : "unavailable",
      detail: "DexScreener is public; GoPlus and creator transfer checks may still be unavailable without provider support.",
    },
    news: {
      status: newsReady ? "live" : "unavailable",
      detail: "RSS-based news sources are available without API keys.",
    },
    social: {
      status: socialProviderReady ? "partial" : "unavailable",
      detail: socialProviderReady
        ? "A social data provider is configured for account, post, reply, engagement or search-based ingestion."
        : "Public metadata can be checked, but follower/reply/bot metrics require X API, Apify, Tavily or another provider.",
    },
    decision: {
      status: "live",
      detail: "Decision Agent is deterministic and uses submitted agent results plus source coverage.",
    },
    execution: {
      status: "live",
      detail: "Execution Agent uses local user rules and approval-only transaction planning.",
    },
  };
}
