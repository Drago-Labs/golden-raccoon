#!/usr/bin/env node

/**
 * Load test script: /api/execute path
 *
 * Usage:
 *   node scripts/load-test-execution.mjs [concurrency] [totalRequests] [baseUrl]
 *
 * Defaults:
 *   concurrency=5, totalRequests=50, baseUrl=http://localhost:3000
 *
 * Example:
 *   node scripts/load-test-execution.mjs 10 200 http://localhost:3000
 *
 * This script exercises:
 *   - /api/execute (POST) — prepares execution
 *   - /api/execute/confirm (POST) — confirms execution approval
 *   - /api/execute/status (GET) — checks status
 */

const BASE_URL = process.argv[3] || 'http://localhost:3000';
const CONCURRENCY = parseInt(process.argv[2], 10) || 5;
const TOTAL_REQUESTS = parseInt(process.argv[4], 10) || 50;

const TIMEOUT_MS = 30_000;

const USER_WALLETS = [
  '0x1111111111111111111111111111111111111111',
  '0x2222222222222222222222222222222222222222',
  '0x3333333333333333333333333333333333333333',
];

function randomWallet() {
  return USER_WALLETS[Math.floor(Math.random() * USER_WALLETS.length)];
}

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

async function executeFlow() {
  const walletAddress = randomWallet();
  const results = { prepare: null, confirm: null, status: null };

  try {
    // Step 1: Prepare execution
    const prepareRes = await fetchWithTimeout(`${BASE_URL}/api/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        amount: '0.1',
        tokenIn: 'USDC',
        tokenOut: 'ETH',
        chainId: 1,
      }),
    });
    results.prepare = { status: prepareRes.status, ok: prepareRes.ok };
    if (!prepareRes.ok) {
      const text = await prepareRes.text().catch(() => '');
      return { walletAddress, results, error: `prepare failed: ${text}` };
    }
    const prepareData = await prepareRes.json();

    // Step 2: Confirm execution
    const confirmRes = await fetchWithTimeout(`${BASE_URL}/api/execute/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        intentId: prepareData.intentId,
        simulation: prepareData.simulation,
        currentCalldata: prepareData.calldata,
      }),
    });
    results.confirm = { status: confirmRes.status, ok: confirmRes.ok };

    // Step 3: Check status
    const statusRes = await fetchWithTimeout(`${BASE_URL}/api/execute/status?walletAddress=${walletAddress}&intentId=${prepareData.intentId}`);
    results.status = { status: statusRes.status, ok: statusRes.ok };

    return { walletAddress, results, error: null };
  } catch (err) {
    return { walletAddress, results, error: err.message };
  }
}

async function worker(workerId, queue) {
  const workerResults = [];
  while (true) {
    const item = queue.shift();
    if (!item) break;
    const result = await executeFlow();
    workerResults.push(result);
  }
  return { workerId, results: workerResults };
}

async function main() {
  console.log(`Load Test: Execution Flow`);
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

  // Aggregate
  let totalOk = 0;
  let totalErr = 0;
  let stepCounts = { prepare: { ok: 0, fail: 0 }, confirm: { ok: 0, fail: 0 }, status: { ok: 0, fail: 0 } };
  const errors = [];

  for (const wr of allWorkerResults) {
    for (const r of wr.results) {
      if (r.error) {
        totalErr++;
        errors.push(r.error);
        continue;
      }
      totalOk++;
      if (r.results.prepare?.ok) stepCounts.prepare.ok++;
      else stepCounts.prepare.fail++;
      if (r.results.confirm?.ok) stepCounts.confirm.ok++;
      else stepCounts.confirm.fail++;
      if (r.results.status?.ok) stepCounts.status.ok++;
      else stepCounts.status.fail++;
    }
  }

  const rps = Math.round((TOTAL_REQUESTS / (elapsedMs / 1000)) * 100) / 100;

  console.log('=== Results ===');
  console.log(`  Elapsed:        ${elapsedMs}ms`);
  console.log(`  Throughput:     ${rps} req/s`);
  console.log(`  Successful:     ${totalOk}`);
  console.log(`  Errors:         ${totalErr}`);
  console.log('');
  console.log('Step-level status:');
  console.log(`  /api/execute          — OK: ${stepCounts.prepare.ok}, FAIL: ${stepCounts.prepare.fail}`);
  console.log(`  /api/execute/confirm  — OK: ${stepCounts.confirm.ok}, FAIL: ${stepCounts.confirm.fail}`);
  console.log(`  /api/execute/status   — OK: ${stepCounts.status.ok}, FAIL: ${stepCounts.status.fail}`);
  console.log('');

  if (errors.length > 0) {
    console.log('Sample errors (first 10):');
    for (const e of errors.slice(0, 10)) {
      console.log(`  - ${e}`);
    }
  }

  // Exit code based on success rate
  const successRate = totalOk / TOTAL_REQUESTS;
  if (successRate < 0.95) {
    console.error(`\nFAIL: success rate ${(successRate * 100).toFixed(1)}% < 95%`);
    process.exit(1);
  }
  console.log(`\nPASS: success rate ${(successRate * 100).toFixed(1)}%`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
