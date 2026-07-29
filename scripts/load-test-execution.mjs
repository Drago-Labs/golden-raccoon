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
 *   - /api/execute/prepare (POST) — prepares execution preview
 *   - /api/execute/confirm (POST) — confirms execution approval
 *
 * Argument order follows the documented/intended convention:
 * concurrency, totalRequests, baseUrl — matching what a user would
 * naturally expect when reading the usage line.
 */

const CONCURRENCY = parseInt(process.argv[2], 10) || 5;
const TOTAL_REQUESTS = parseInt(process.argv[3], 10) || 50;
const BASE_URL = process.argv[4] || 'http://localhost:3000';

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
  const results = { prepare: null, confirm: null };

  try {
    // Step 1: Prepare execution preview
    // The /api/execute/prepare route accepts walletAddress, action, fromToken,
    // toToken, riskScore, network, etc. (all optional per Zod bodySchema).
    const prepareRes = await fetchWithTimeout(`${BASE_URL}/api/execute/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        action: 'reduce_exposure',
        fromToken: 'USDC',
        toToken: 'ETH',
        riskScore: 70,
        network: 'ethereum',
      }),
    });
    results.prepare = { status: prepareRes.status, ok: prepareRes.ok };
    if (!prepareRes.ok) {
      const text = await prepareRes.text().catch(() => '');
      return { walletAddress, results, error: `prepare failed: ${text}` };
    }
    const prepareData = await prepareRes.json();

    // Step 2: Confirm execution
    // /api/execute/confirm requires: txHash, walletAddress, userApproved=true.
    // Optional fields include simulation, currentBlockNumber, etc.
    const confirmRes = await fetchWithTimeout(`${BASE_URL}/api/execute/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        txHash: '0x0000000000000000000000000000000000000000000000000000000000000001',
        userApproved: true,
        network: 'ethereum',
        action: 'reduce_exposure',
        riskScore: 70,
        simulationStatus: prepareData.simulation?.status ?? 'pending',
        simulation: prepareData.simulation ?? {
          simulatedTxHash: '0x0000000000000000000000000000000000000000000000000000000000000001',
          status: 'pending',
          checks: [],
          detail: 'Load-test placeholder',
        },
        currentBlockNumber: 1000,
      }),
    });
    results.confirm = { status: confirmRes.status, ok: confirmRes.ok };

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
  let stepCounts = { prepare: { ok: 0, fail: 0 }, confirm: { ok: 0, fail: 0 } };
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
  console.log(`  /api/execute/prepare  — OK: ${stepCounts.prepare.ok}, FAIL: ${stepCounts.prepare.fail}`);
  console.log(`  /api/execute/confirm  — OK: ${stepCounts.confirm.ok}, FAIL: ${stepCounts.confirm.fail}`);
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
