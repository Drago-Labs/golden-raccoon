const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
const isJson = process.argv.includes("--json");

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
  {
    name: "x402 premium requires payment",
    path: "/api/x402/deep-scan?query=GOAT&chain=base",
    init: { method: "GET", headers: { Accept: "application/json" } },
    expectedStatus: 402,
    validate: (_body, response) => Boolean(response.headers.get("payment-required") || response.headers.get("x-payment-required")),
  },
  {
    name: "x402 duplicate payment rejected",
    path: "/api/x402/deep-scan?query=GOAT&chain=base",
    init: { method: "GET", headers: { Accept: "application/json", "PAYMENT-SIGNATURE": "smoke-duplicate-sig" } },
    skip: !process.env.SMOKE_DUPLICATE_X402_ENABLED,
    validate: (body) => body.error === "duplicate_x402_payment",
    expectedStatus: 409,
  },
  {
    name: "x402 terms exposes payment config",
    path: "/api/x402/terms",
    init: { method: "GET", headers: { Accept: "application/json" } },
    validate: (body) => typeof body.priceUsd === "string" && typeof body.network === "string" && typeof body.payTo === "string",
  },
  {
    name: "x402 deep scan premium unlock with valid payment sig",
    path: "/api/x402/deep-scan?query=GOAT&chain=base",
    init: { method: "GET", headers: { Accept: "application/json", "PAYMENT-SIGNATURE": "smoke-valid-payment-sig-" + Date.now().toString(36) } },
    skip: !process.env.SMOKE_X402_FULL,
    expectedStatus: 200,
    validate: (body) => body.premium?.unlocked === true && body.premium?.tier === "deep_scan" && body.scan !== undefined,
  },
];

const structuredResults = {
  timestamp: new Date().toISOString(),
  baseUrl,
  environment: process.env.APP_MODE || "production",
  baselineTargetPassRate: 1.0,
  results: [],
  summary: { total: checks.length, passed: 0, failed: 0, skipped: 0 },
};

for (const check of checks) {
  if (check.skip) {
    if (!isJson) console.log(`smoke-api: ${check.name} skipped`);
    structuredResults.results.push({ name: check.name, status: "skipped" });
    structuredResults.summary.skipped++;
    continue;
  }

  const checkStart = Date.now();
  let response;
  try {
    response = await fetch(`${baseUrl}${check.path}`, check.init);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    structuredResults.results.push({
      name: check.name,
      status: "failed",
      durationMs: Date.now() - checkStart,
      error: errorMsg,
    });
    structuredResults.summary.failed++;
    if (isJson) {
      console.log(JSON.stringify(structuredResults, null, 2));
    }
    throw new Error(`${check.name} connection failed: ${errorMsg}`);
  }

  const durationMs = Date.now() - checkStart;
  if (check.expectedStatus && response.status !== check.expectedStatus) {
    structuredResults.results.push({
      name: check.name,
      status: "failed",
      durationMs,
      error: `HTTP ${response.status}, expected ${check.expectedStatus}`,
    });
    structuredResults.summary.failed++;
    if (isJson) console.log(JSON.stringify(structuredResults, null, 2));
    throw new Error(`${check.name} failed with HTTP ${response.status}, expected ${check.expectedStatus}`);
  }

  if (!check.expectedStatus && !response.ok) {
    structuredResults.results.push({
      name: check.name,
      status: "failed",
      durationMs,
      error: `HTTP ${response.status}`,
    });
    structuredResults.summary.failed++;
    if (isJson) console.log(JSON.stringify(structuredResults, null, 2));
    throw new Error(`${check.name} failed with HTTP ${response.status}`);
  }

  const body = await response.json().catch(() => ({}));

  if (!check.validate(body, response)) {
    structuredResults.results.push({
      name: check.name,
      status: "failed",
      durationMs,
      error: "returned unexpected payload",
    });
    structuredResults.summary.failed++;
    if (isJson) console.log(JSON.stringify(structuredResults, null, 2));
    throw new Error(`${check.name} returned unexpected payload`);
  }

  structuredResults.results.push({
    name: check.name,
    status: "passed",
    durationMs,
  });
  structuredResults.summary.passed++;

  if (!isJson) {
    console.log(`smoke-api: ${check.name} passed (${durationMs}ms)`);
  }
}

if (isJson) {
  console.log(JSON.stringify(structuredResults, null, 2));
} else {
  console.log("=> Smoke tests complete. All active endpoints passed.");
}
