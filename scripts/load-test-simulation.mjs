#!/usr/bin/env node

/**
 * Load test script: /api/simulate and /api/simulate/status paths
 *
 * Usage:
 *   node scripts/load-test-simulation.mjs [concurrency] [totalRequests] [baseUrl]
 *
 * Defaults:
 *   concurrency=10, totalRequests=200, baseUrl=http://localhost:3000
 *
 * Example:
 *   node scripts/load-test-simulation.mjs 20 500 http://localhost:3000
 */

const BASE_URL = process.argv[3] || 'http://localhost:3000';
const CONCURRENCY = parseInt(process.argv[2], 10) || 10;
const TOTAL_REQUESTS = parseInt(process.argv[4], 10) || 200;
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
    const simRes = await fetchWithTimeout(`${BASE_URL}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId: chain.chainId,
        network: chain.network,
        tokenIn: tokens.tokenIn,
        tokenOut: tokens.tokenOut,
        amount: tokens.amount,
        userAddress: '0x0000000000000000000000000000000000000000',
      }),
    });

    if (!simRes.ok) {
      return { error: `simulate failed: ${simRes.status}`, chain, tokens };
    }

    const simData = await simRes.json();
    const simId = simData.simulationId || simData.id;

    // Poll status a few times
    if (simId) {
      for (let i = 0; i < 5; i++) {
        const statusRes = await fetchWithTimeout(
          `${BASE_URL}/api/simulate/status?id=${simId}`
        );
        if (statusRes.ok) break;
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    const latency = simData._latency || null;
    return { ok: true, chain, tokens, latency, simDataSize: JSON.stringify(simData).length };
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
  const latencies = [];
  const errors = [];

  for (const wr of allWorkerResults) {
    for (const r of wr.results) {
      if (r.error) {
        totalErr++;
        errors.push(r.error);
      } else {
        totalOk++;
        if (r.latency) latencies.push(r.latency);
      }
    }
  }

  const rps = Math.round((TOTAL_REQUESTS / (elapsedMs / 1000)) * 100) / 100;
  const okRate = ((totalOk / TOTAL_REQUESTS) * 100).toFixed(1);

  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0;

  console.log('=== Results ===');
  console.log(`  Elapsed:        ${elapsedMs}ms`);
  console.log(`  Throughput:     ${rps} req/s`);
  console.log(`  Success rate:   ${okRate}% (${totalOk}/${TOTAL_REQUESTS})`);
  console.log(`  Errors:         ${totalErr}`);
  console.log('');
  console.log('Latency (ms):');
  console.log(`  avg:  ${avgLatency}`);
  console.log(`  p50:  ${p50}`);
  console.log(`  p95:  ${p95}`);
  console.log(`  p99:  ${p99}`);

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
