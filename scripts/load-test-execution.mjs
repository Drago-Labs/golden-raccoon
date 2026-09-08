#!/usr/bin/env node

/**
 * Load test script: /api/execute path
 *
 * Usage:
 *   node scripts/load-test-execution.mjs [concurrency] [totalRequests] [baseUrl] [--json]
 *
 * Defaults:
 *   concurrency=5, totalRequests=50, baseUrl=http://localhost:3000
 */

const isJson = process.argv.includes("--json");
const filteredArgs = process.argv.slice(2).filter(a => a !== "--json");

const CONCURRENCY = parseInt(filteredArgs[0], 10) || 5;
const TOTAL_REQUESTS = parseInt(filteredArgs[1], 10) || 50;
const BASE_URL = filteredArgs[2] || 'http://localhost:3000';

const TIMEOUT_MS = 30_000;

// Baseline thresholds from docs/PERFORMANCE_BUDGETS.md
const BASELINE_BUDGET = {
  minSuccessRate: 0.95,
  maxP95LatencyMs: 2500,
  minThroughputRps: 5.0,
};

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
  const results = { prepare: null, confirm: null, reconcile: null };

  try {
    const prepareRes = await fetchWithTimeout(`${BASE_URL}/api/execute/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        action: 'reduce_exposure',
        fromToken: 'MEME',
        toToken: 'USDC',
        percent: 25,
        riskScore: 72,
        network: 'base',
      }),
    });

    results.prepare = {
      status: prepareRes.status,
      ok: prepareRes.ok,
      data: await prepareRes.json().catch(() => null),
    };

    if (!prepareRes.ok) {
      return { ok: false, error: `prepare returned ${prepareRes.status}`, results };
    }

    const preview = results.prepare.data;
    const planId = preview?.planId || preview?.executionPlanId || 'plan-load-test';

    const confirmRes = await fetchWithTimeout(`${BASE_URL}/api/execute/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId,
        walletAddress,
        signature: '0x' + 'ab'.repeat(65),
      }),
    });

    results.confirm = {
      status: confirmRes.status,
      ok: confirmRes.ok,
      data: await confirmRes.json().catch(() => null),
    };

    const reconcileRes = await fetchWithTimeout(
      `${BASE_URL}/api/history/agent-runs?walletAddress=${walletAddress}&limit=1`,
      { method: 'GET' }
    );

    results.reconcile = {
      status: reconcileRes.status,
      ok: reconcileRes.ok,
    };

    return {
      ok: results.prepare.ok && results.confirm.ok,
      results,
    };
  } catch (err) {
    return { ok: false, error: err.message, results };
  }
}

async function worker(queue, results) {
  while (queue.length > 0) {
    const index = queue.shift();
    if (index === undefined) break;

    const start = Date.now();
    const outcome = await executeFlow();
    const duration = Date.now() - start;

    results.push({ index, duration, ...outcome });
  }
}

async function main() {
  if (!isJson) {
    console.log(`Starting load test: concurrency=${CONCURRENCY}, requests=${TOTAL_REQUESTS}, baseUrl=${BASE_URL}`);
  }

  const queue = Array.from({ length: TOTAL_REQUESTS }, (_, i) => i);
  const results = [];
  const start = Date.now();

  const workers = Array.from({ length: CONCURRENCY }, () => worker(queue, results));
  await Promise.all(workers);

  const elapsedMs = Date.now() - start;

  let totalOk = 0;
  let totalErr = 0;
  const latencies = [];
  const errors = [];
  const stepCounts = {
    prepare: { ok: 0, fail: 0 },
    confirm: { ok: 0, fail: 0 },
    reconcile: { ok: 0, fail: 0 },
  };

  for (const r of results) {
    latencies.push(r.duration);
    if (r.ok) {
      totalOk++;
      stepCounts.prepare.ok++;
      stepCounts.confirm.ok++;
      if (r.results.reconcile?.status === 200) stepCounts.reconcile.ok++;
    } else {
      if (r.error) {
        totalErr++;
        errors.push(r.error);
      }
      if (r.results.prepare?.ok) stepCounts.prepare.ok++;
      else stepCounts.prepare.fail++;
      if (r.results.confirm?.ok) stepCounts.confirm.ok++;
      else stepCounts.confirm.fail++;
      if (r.results.reconcile?.status === 200) stepCounts.reconcile.ok++;
      else stepCounts.reconcile.fail++;
    }
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const rps = Math.round((TOTAL_REQUESTS / (elapsedMs / 1000)) * 100) / 100;
  const successRate = totalOk / TOTAL_REQUESTS;

  const baselineComparison = {
    successRate: { observed: successRate, target: BASELINE_BUDGET.minSuccessRate, pass: successRate >= BASELINE_BUDGET.minSuccessRate },
    p95LatencyMs: { observed: p95, target: BASELINE_BUDGET.maxP95LatencyMs, pass: p95 <= BASELINE_BUDGET.maxP95LatencyMs },
  };

  const output = {
    benchmark: "load_test_execution",
    timestamp: new Date().toISOString(),
    config: { concurrency: CONCURRENCY, totalRequests: TOTAL_REQUESTS, baseUrl: BASE_URL },
    metrics: { elapsedMs, throughputRps: rps, totalOk, totalErr, p50LatencyMs: p50, p95LatencyMs: p95, successRate },
    stepCounts,
    baselineComparison,
    errors: errors.slice(0, 10),
  };

  if (isJson) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log('=== Results ===');
    console.log(`  Elapsed:        ${elapsedMs}ms`);
    console.log(`  Throughput:     ${rps} req/s`);
    console.log(`  Successful:     ${totalOk}`);
    console.log(`  Errors:         ${totalErr}`);
    console.log(`  p50 Latency:    ${p50}ms`);
    console.log(`  p95 Latency:    ${p95}ms`);
    console.log(`  Success Rate:   ${(successRate * 100).toFixed(1)}% (Target: >= ${(BASELINE_BUDGET.minSuccessRate * 100)}%)`);
  }

  if (successRate < BASELINE_BUDGET.minSuccessRate) {
    if (!isJson) console.error(`\nFAIL: success rate ${(successRate * 100).toFixed(1)}% < 95%`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
