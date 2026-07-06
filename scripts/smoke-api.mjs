const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

const postJson = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const checks = [
  {
    name: "health",
    path: "/api/health",
    init: { method: "GET" },
    validate: (body) => body.ok === true && body.agentReadiness && body.mockFallbacksEnabled === false && body.storage?.schema?.tables?.includes("agent_runs"),
  },
  {
    name: "portfolio endpoint",
    path: "/api/agents/portfolio",
    init: postJson({ walletAddress: "0x0000000000000000000000000000000000000001" }),
    validate: (body) => body.agent === "portfolio" && body.recommendedAction && body.dataQuality,
  },
  {
    name: "onchain invalid address",
    path: "/api/agents/onchain",
    init: postJson({ chain: "base", contractAddress: "not-a-contract" }),
    expectedStatus: 400,
    validate: (body) => Boolean(body.error),
  },
  {
    name: "news symbol-only low confidence",
    path: "/api/agents/news",
    init: postJson({ symbol: "GOAT" }),
    validate: (body) => body.agent === "news" && body.confidence < 0.75,
  },
  {
    name: "social no provider does not mock",
    path: "/api/agents/social",
    init: postJson({ symbol: "GOAT" }),
    validate: (body) => body.agent === "social" && body.rawSignals?.providerDataAvailable === false,
  },
  {
    name: "decision no results manual review",
    path: "/api/agents/decision",
    init: postJson({ results: [] }),
    validate: (body) => body.agent === "decision" && body.recommendedAction === "manual_review",
  },
  {
    name: "execution prepare policy preview",
    path: "/api/execute/prepare",
    init: postJson({
      walletAddress: "0x0000000000000000000000000000000000000001",
      action: "manual_review",
      fromToken: "MEME",
      toToken: "USDC",
      percent: 10,
      riskScore: 60,
    }),
    validate: (body) => body.requiresApproval === false && body.policy?.autoExecute === false && body.audit?.serverCanSign === false,
  },
  {
    name: "invalid token scan does not mock",
    path: "/api/scan/token",
    init: postJson({ query: "not-a-contract", chain: "base" }),
    validate: (body) => body.dataQuality?.mode === "unavailable" && body.dataQuality?.mockSources === 0,
  },
];

for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`, check.init);

  if (check.expectedStatus && response.status !== check.expectedStatus) {
    throw new Error(`${check.name} failed with HTTP ${response.status}, expected ${check.expectedStatus}`);
  }

  if (!check.expectedStatus && !response.ok) {
    throw new Error(`${check.name} failed with HTTP ${response.status}`);
  }

  const body = await response.json();

  if (!check.validate(body)) {
    throw new Error(`${check.name} returned unexpected payload`);
  }

  console.log(`smoke-api: ${check.name} ok`);
}
