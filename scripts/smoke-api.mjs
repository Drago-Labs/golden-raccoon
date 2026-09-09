#!/usr/bin/env node

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");

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
    maxLatencyMs: 1000,
    validate: (body) =>
      body.ok === true &&
      body.agentReadiness &&
      body.mockFallbacksEnabled === false &&
      body.storage?.schema?.tables?.includes("agent_runs"),
  },
  {
    name: "operations readiness gate",
    path: "/api/operations/readiness",
    init: { method: "GET" },
    maxLatencyMs: 2000,
    validate: (body) =>
      typeof body.verdict === "string" &&
      Array.isArray(body.gates) &&
      body.summary !== undefined,
  },
  {
    name: "portfolio endpoint",
    path: "/api/agents/portfolio",
    init: postJson({ walletAddress: "0x0000000000000000000000000000000000000001" }),
    maxLatencyMs: 2500,
    validate: (body) => body.agent === "portfolio" && body.recommendedAction && body.dataQuality,
  },
  {
    name: "onchain invalid address",
    path: "/api/agents/onchain",
    init: postJson({ chain: "base", contractAddress: "not-a-contract" }),
    expectedStatus: 400,
    maxLatencyMs: 1500,
    validate: (body) => Boolean(body.error),
  },
  {
    name: "news symbol-only low confidence",
    path: "/api/agents/news",
    init: postJson({ symbol: "GOAT" }),
    maxLatencyMs: 2500,
    validate: (body) => body.agent === "news" && body.confidence < 0.75,
  },
  {
    name: "social no provider does not mock",
    path: "/api/agents/social",
    init: postJson({ symbol: "GOAT" }),
    maxLatencyMs: 2000,
    validate: (body) => body.agent === "social" && body.rawSignals?.providerDataAvailable === false,
  },
  {
    name: "decision no results manual review",
    path: "/api/agents/decision",
    init: postJson({ results: [] }),
    maxLatencyMs: 1500,
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
    maxLatencyMs: 2500,
    validate: (body) =>
      body.requiresApproval === false &&
      body.policy?.autoExecute === false &&
      body.audit?.serverCanSign === false,
  },
  {
    name: "invalid token scan does not mock",
    path: "/api/scan/token",
    init: postJson({ query: "not-a-contract", chain: "base" }),
    maxLatencyMs: 1500,
    validate: (body) =>
      body.dataQuality?.mode === "unavailable" && body.dataQuality?.mockSources === 0,
  },
  {
    name: "x402 premium requires payment",
    path: "/api/x402/deep-scan?query=GOAT&chain=base",
    init: { method: "GET", headers: { Accept: "application/json" } },
    expectedStatus: 402,
    maxLatencyMs: 1500,
    validate: (_body, response) =>
      Boolean(response.headers.get("payment-required") || response.headers.get("x-payment-required")),
  },
  {
    name: "x402 duplicate payment rejected",
    path: "/api/x402/deep-scan?query=GOAT&chain=base",
    init: {
      method: "GET",
      headers: { Accept: "application/json", "PAYMENT-SIGNATURE": "smoke-duplicate-sig" },
    },
    skip: !process.env.SMOKE_DUPLICATE_X402_ENABLED,
    expectedStatus: 409,
    maxLatencyMs: 1500,
    validate: (body) => body.error === "duplicate_x402_payment",
  },
  {
    name: "x402 terms exposes payment config",
    path: "/api/x402/terms",
    init: { method: "GET", headers: { Accept: "application/json" } },
    maxLatencyMs: 1000,
    validate: (body) =>
      typeof body.priceUsd === "string" &&
      typeof body.network === "string" &&
      typeof body.payTo === "string",
  },
  {
    name: "x402 deep scan premium unlock with valid payment sig",
    path: "/api/x402/deep-scan?query=GOAT&chain=base",
    init: {
      method: "GET",
      headers: {
        Accept: "application/json",
        "PAYMENT-SIGNATURE": "smoke-valid-payment-sig-" + Date.now().toString(36),
      },
    },
    skip: !process.env.SMOKE_X402_FULL,
    expectedStatus: 200,
    maxLatencyMs: 2000,
    validate: (body) =>
      body.premium?.unlocked === true &&
      body.premium?.tier === "deep_scan" &&
      body.scan !== undefined,
  },
];

async function runSmokeSuite() {
  const overallStart = Date.now();
  const results = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const check of checks) {
    if (check.skip) {
      skipped += 1;
      results.push({
        name: check.name,
        path: check.path,
        status: "skip",
        latencyMs: 0,
      });
      continue;
    }

    const checkStart = Date.now();
    try {
      const response = await fetch(`${baseUrl}${check.path}`, check.init);
      const latencyMs = Date.now() - checkStart;

      if (check.expectedStatus && response.status !== check.expectedStatus) {
        throw new Error(
          `Unexpected HTTP status: received ${response.status}, expected ${check.expectedStatus}`
        );
      }

      if (!check.expectedStatus && !response.ok) {
        throw new Error(`HTTP request failed with status: ${response.status}`);
      }

      const body = await response.json().catch(() => ({}));

      if (!check.validate(body, response)) {
        throw new Error("Response body failed validation criteria");
      }

      passed += 1;
      results.push({
        name: check.name,
        path: check.path,
        status: "pass",
        latencyMs,
        budgetMet: latencyMs <= check.maxLatencyMs,
      });
    } catch (err) {
      failed += 1;
      results.push({
        name: check.name,
        path: check.path,
        status: "fail",
        latencyMs: Date.now() - checkStart,
        error: err.message,
      });
    }
  }

  const payload = {
    suite: "smoke-api",
    targetUrl: baseUrl,
    environment: process.env.APP_MODE || "development",
    total: checks.length,
    passed,
    failed,
    skipped,
    durationMs: Date.now() - overallStart,
    results,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`Smoke API Suite: ${failed === 0 ? "PASSED" : "FAILED"}`);
    console.log(`Target: ${baseUrl} (${payload.environment})`);
    console.log(
      `Passed: ${passed}/${checks.length} checks (${skipped} skipped, ${failed} failed) in ${payload.durationMs}ms`
    );
    for (const r of results) {
      const budgetNote = r.budgetMet === false ? " (exceeded latency budget)" : "";
      console.log(
        `  [${r.status.toUpperCase()}] ${r.name} (${r.path}) - ${r.latencyMs}ms${budgetNote}${r.error ? ` Error: ${r.error}` : ""}`
      );
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runSmokeSuite().catch((err) => {
  console.error("Fatal error executing smoke suite:", err);
  process.exit(1);
});
