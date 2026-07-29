#!/usr/bin/env node

/**
 * Load test script: simulation-adjacent endpoint (/api/execute/prepare)
 *
 * There is no standalone /api/simulate route in this repository.
 * Simulation planning happens as part of /api/execute/prepare via
 * buildExecutionPreviewFromPortfolio → getSimulationPlan. This script
 * exercises that path under load.
 *
 * Usage:
 *   node scripts/load-test-simulation.mjs [concurrency] [totalRequests] [baseUrl]
 *
 * Defaults:
 *   concurrency=10, totalRequests=200, baseUrl=http://localhost:3000
 *
 * Example:
 *   node scripts/load-test-simulation.mjs 20 500 http://localhost:3000
 *
 * Argument order follows the documented/intended convention:
 * concurrency, totalRequests, baseUrl.
 */

const CONCURRENCY = parseInt(process.argv[2], 10) || 10;
const TOTAL_REQUESTS = parseInt(process.argv[3], 10) || 200;
const BASE_URL = process.argv[4] || 'http://localhost:3000';
const TIMEOUT_MS = 60_000; // simulations can take longer

const CHAINS = [
  { network: 'ethereum', chainId: 1 },
  { network: 'soroban', chainId: 8453 },
  { network: 'arbitrum', chainId: 42161 },
  { network: 'polygon', chainId: 137 },
];

const TOKENS = [
  { tokenIn: 'USDC', tokenOut: 'ETH', amount: '1.0' },
  { tokenIn: 'ETH', tokenOut: 'USDC', amount: '0.5' },
  { tokenIn: 'WBTC', tokenOut: 'USDC', amount: '0.1' },
  { tokenIn: 'USDC', tokenOut: 'USDT', amount: '100.0' },
];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

async function simulateFlow() {
  const chain = randomChoice(CHAINS);
  const tokens = randomChoice(TOKENS);

  try {
    // Simulation planning is part of /api/execute/prepare (there is no
    // standalone /api/simulate route). The prepare endpoint calls
    // buildExecutionPreviewFromPortfolio internally, which invokes
    // getSimulationPlan for high-risk trade actions.
    const prepareRes = await fetchWithTimeout(`${BASE_URL}/api/execute/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: chain.network === 'soroban'
          ? 'GBPL4BQKGYLNTNXYY4E76KMGY5BCYZYVGSZ4ED5RYH2YQK5T3GV2AAAA'
          : '0x0000000000000000000000000000000000000000',
        action: 'reduce_exposure',
        fromToken: tokens.tokenIn,
        toToken: tokens.tokenOut,
        riskScore: 70,
        network: chain.network,
        estimatedValueUsd: parseFloat(tokens.amount) * 100,
        slippageBps: 100,
        simulationStatus: 'pending',
      }),
    });

    const latency = null; // server-side timing not available via this endpoint
    const simData = await prepareRes.json().catch(() => ({}));

    return {
      ok: prepareRes.ok,
      chain,
      tokens,
      latency,
      status: prepareRes.status,
      simDataSize: JSON.stringify(simData).length,
      simulationStatus: simData.simulation?.status ?? 'unavailable',
    };
  } catch (err) {
    return { error: err.message, chain, tokens };
  }
}

async function worker(workerId, queue) {
  const workerResults = [];
  while (true) {
    const item = queue.shift();
    if (!item) break;
    workerResults.push(await simulateFlow());
  }
  return { workerId, results: workerResults };
}

async function main() {
  console.log(`Load Test: Simulation Flow`);
  console.log(`  Base URL:     ${BASE_URL}`);
  console.log(`  Concurrency:   ${CONCURRENCY}`);
  console.log(`  Total requests: ${TOTAL_REQUESTS}`);
  console.log(`  Timeout:       ${TIMEOUT_MS}ms`);
  console.log('');

  const queue = Array.from({ length: TOTAL_REQUESTS }, (_, i) => i);
  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i, queue));

  const startTime = Date.now();
  const allWorkerResults = await Promise.all(workers);
  const elapsedMs = Date.now() - startTime;

  let totalOk = 0;
  let totalErr = 0;
  const errors = [];

  for (const wr of allWorkerResults) {
    for (const r of wr.results) {
      if (r.error) {
        totalErr++;
        errors.push(r.error);
      } else {
        totalOk++;
      }
    }
  }

  const rps = Math.round((TOTAL_REQUESTS / (elapsedMs / 1000)) * 100) / 100;
  const okRate = ((totalOk / TOTAL_REQUESTS) * 100).toFixed(1);

  console.log('=== Results ===');
  console.log(`  Elapsed:        ${elapsedMs}ms`);
  console.log(`  Throughput:     ${rps} req/s`);
  console.log(`  Success rate:   ${okRate}% (${totalOk}/${TOTAL_REQUESTS})`);
  console.log(`  Errors:         ${totalErr}`);

  console.log('');
  console.log('Note: /api/execute/prepare exercises simulation planning (via');
  console.log('buildExecutionPreviewFromPortfolio -> getSimulationPlan). There is');
  console.log('no standalone /api/simulate route in this repository.');

  if (errors.length > 0) {
    console.log('');
    console.log('Sample errors (first 10):');
    for (const e of errors.slice(0, 10)) {
      console.log(`  - ${e}`);
    }
  }

  if (totalOk / TOTAL_REQUESTS < 0.90) {
    console.error(`\nFAIL: success rate ${okRate}% < 90%`);
    process.exit(1);
  }
  console.log(`\nPASS: success rate ${okRate}%`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
