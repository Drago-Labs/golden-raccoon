#!/usr/bin/env node

const args = process.argv.slice(2).filter((a) => a !== "--json");
const jsonOutput = process.argv.includes("--json");

const CONCURRENCY = parseInt(args[0], 10) || 10;
const TOTAL_REQUESTS = parseInt(args[1], 10) || 200;
const BASE_URL = args[2] || "http://localhost:3000";
const TIMEOUT_MS = 60_000;

const CHAINS = [
  { network: "ethereum", chainId: 1 },
  { network: "soroban", chainId: 8453 },
  { network: "arbitrum", chainId: 42161 },
  { network: "polygon", chainId: 137 },
];

const TOKENS = [
  { tokenIn: "USDC", tokenOut: "ETH", amount: "1.0" },
  { tokenIn: "ETH", tokenOut: "USDC", amount: "0.5" },
  { tokenIn: "WBTC", tokenOut: "USDC", amount: "0.1" },
  { tokenIn: "USDC", tokenOut: "USDT", amount: "100.0" },
];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(id)
  );
}

async function simulateFlow() {
  const chain = randomChoice(CHAINS);
  const tokens = randomChoice(TOKENS);
  const flowStart = Date.now();

  try {
    const prepareRes = await fetchWithTimeout(`${BASE_URL}/api/execute/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress:
          chain.network === "soroban"
            ? "GBPL4BQKGYLNTNXYY4E76KMGY5BCYZYVGSZ4ED5RYH2YQK5T3GV2AAAA"
            : "0x0000000000000000000000000000000000000000",
        action: "reduce_exposure",
        fromToken: tokens.tokenIn,
        toToken: tokens.tokenOut,
        riskScore: 70,
        network: chain.network,
        estimatedValueUsd: parseFloat(tokens.amount) * 100,
        slippageBps: 100,
        simulationStatus: "pending",
      }),
    });

    const latencyMs = Date.now() - flowStart;
    const simData = await prepareRes.json().catch(() => ({}));

    return {
      ok: prepareRes.ok,
      chain,
      tokens,
      latencyMs,
      status: prepareRes.status,
      simDataSize: JSON.stringify(simData).length,
      simulationStatus: simData.simulation?.status ?? "unavailable",
    };
  } catch (err) {
    return {
      error: err.message,
      chain,
      tokens,
      latencyMs: Date.now() - flowStart,
    };
  }
}

async function worker(workerId, queue) {
  const workerResults = [];
  while (true) {
    const item = queue.shift();
    if (item === undefined) break;
    workerResults.push(await simulateFlow());
  }
  return { workerId, results: workerResults };
}

async function main() {
  const queue = Array.from({ length: TOTAL_REQUESTS }, (_, i) => i);
  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i, queue));

  const startTime = Date.now();
  const allWorkerResults = await Promise.all(workers);
  const elapsedMs = Date.now() - startTime;

  let totalOk = 0;
  let totalErr = 0;
  const errors = [];
  const latencies = [];

  for (const wr of allWorkerResults) {
    for (const r of wr.results) {
      if (r.latencyMs !== undefined) {
        latencies.push(r.latencyMs);
      }
      if (r.error || !r.ok) {
        totalErr++;
        if (r.error) errors.push(r.error);
        else errors.push(`HTTP ${r.status}`);
      } else {
        totalOk++;
      }
    }
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const rps = Math.round((TOTAL_REQUESTS / (elapsedMs / 1000)) * 100) / 100;
  const successRate = totalOk / TOTAL_REQUESTS;
  const meetsBaseline = successRate >= 0.90 && p95 <= 5000;

  const summary = {
    suite: "load-test-simulation",
    baseUrl: BASE_URL,
    concurrency: CONCURRENCY,
    totalRequests: TOTAL_REQUESTS,
    elapsedMs,
    rps,
    successful: totalOk,
    errors: totalErr,
    successRate,
    latencies: { p50, p95 },
    baselineComparison: {
      requiredSuccessRate: 0.90,
      maxP95Ms: 5000,
      meetsBaseline,
    },
    sampleErrors: errors.slice(0, 10),
  };

  if (jsonOutput) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log("Load Test: Simulation Flow");
    console.log(`  Base URL:       ${BASE_URL}`);
    console.log(`  Concurrency:    ${CONCURRENCY}`);
    console.log(`  Total requests: ${TOTAL_REQUESTS}`);
    console.log(`  Elapsed:        ${elapsedMs}ms`);
    console.log(`  Throughput:     ${rps} req/s`);
    console.log(`  Success rate:   ${(successRate * 100).toFixed(1)}% (${totalOk}/${TOTAL_REQUESTS})`);
    console.log(`  Errors:         ${totalErr}`);
    console.log(`  Latency (P50):  ${p50}ms`);
    console.log(`  Latency (P95):  ${p95}ms`);

    if (errors.length > 0) {
      console.log("Sample errors:");
      for (const e of errors.slice(0, 5)) {
        console.log(`  - ${e}`);
      }
    }

    console.log(`\nSuccess rate: ${(successRate * 100).toFixed(1)}%`);
  }

  if (!meetsBaseline) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
