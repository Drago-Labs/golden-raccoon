#!/usr/bin/env node

const args = process.argv.slice(2).filter((a) => a !== "--json");
const jsonOutput = process.argv.includes("--json");

const CONCURRENCY = parseInt(args[0], 10) || 5;
const TOTAL_REQUESTS = parseInt(args[1], 10) || 50;
const BASE_URL = args[2] || "http://localhost:3000";

const TIMEOUT_MS = 30_000;

const USER_WALLETS = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
];

function randomWallet() {
  return USER_WALLETS[Math.floor(Math.random() * USER_WALLETS.length)];
}

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(id)
  );
}

async function executeFlow() {
  const walletAddress = randomWallet();
  const results = { prepare: null, confirm: null, reconcile: null };
  const flowStart = Date.now();

  try {
    const prepareRes = await fetchWithTimeout(`${BASE_URL}/api/execute/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress,
        action: "reduce_exposure",
        fromToken: "USDC",
        toToken: "ETH",
        riskScore: 70,
        network: "ethereum",
      }),
    });
    results.prepare = { status: prepareRes.status, ok: prepareRes.ok };
    if (!prepareRes.ok) {
      const text = await prepareRes.text().catch(() => "");
      return { walletAddress, results, error: `prepare failed: ${text}`, durationMs: Date.now() - flowStart };
    }
    const prepareData = await prepareRes.json();

    const confirmRes = await fetchWithTimeout(`${BASE_URL}/api/execute/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress,
        txHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
        userApproved: true,
        network: "ethereum",
        action: "reduce_exposure",
        riskScore: 70,
        simulationStatus: prepareData.simulation?.status ?? "pending",
        simulation: prepareData.simulation ?? {
          simulatedTxHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
          status: "pending",
          checks: [],
          detail: "Load-test placeholder",
        },
        currentBlockNumber: 1000,
      }),
    });
    results.confirm = { status: confirmRes.status, ok: confirmRes.ok };

    let reconciliation;
    for (let attempt = 0; attempt < 5; attempt++) {
      const statusRes = await fetchWithTimeout(
        `${BASE_URL}/api/execute/transactions/0x0000000000000000000000000000000000000000000000000000000000000001?network=ethereum`
      );
      const body = await statusRes.json().catch(() => ({}));
      reconciliation = {
        status: statusRes.status,
        lifecycle: body.transaction?.lifecycleStatus,
        finality: body.finality,
      };
      if (
        ["confirmed", "failed", "replaced", "dropped", "manual_review"].includes(
          reconciliation.lifecycle
        )
      )
        break;
    }
    results.reconcile = reconciliation;

    return { walletAddress, results, error: null, durationMs: Date.now() - flowStart };
  } catch (err) {
    return { walletAddress, results, error: err.message, durationMs: Date.now() - flowStart };
  }
}

async function worker(workerId, queue) {
  const workerResults = [];
  while (true) {
    const item = queue.shift();
    if (item === undefined) break;
    const result = await executeFlow();
    workerResults.push(result);
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
  const stepCounts = {
    prepare: { ok: 0, fail: 0 },
    confirm: { ok: 0, fail: 0 },
    reconcile: { ok: 0, fail: 0 },
  };
  const errors = [];
  const latencies = [];

  for (const wr of allWorkerResults) {
    for (const r of wr.results) {
      if (r.durationMs !== undefined) {
        latencies.push(r.durationMs);
      }
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
      if (r.results.reconcile?.status === 200) stepCounts.reconcile.ok++;
      else stepCounts.reconcile.fail++;
    }
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const rps = Math.round((TOTAL_REQUESTS / (elapsedMs / 1000)) * 100) / 100;
  const successRate = totalOk / TOTAL_REQUESTS;
  const meetsBaseline = successRate >= 0.95 && p95 <= 8000;

  const summary = {
    suite: "load-test-execution",
    baseUrl: BASE_URL,
    concurrency: CONCURRENCY,
    totalRequests: TOTAL_REQUESTS,
    elapsedMs,
    rps,
    successful: totalOk,
    errors: totalErr,
    successRate,
    latencies: { p50, p95 },
    stepCounts,
    baselineComparison: {
      requiredSuccessRate: 0.95,
      maxP95Ms: 8000,
      meetsBaseline,
    },
    sampleErrors: errors.slice(0, 10),
  };

  if (jsonOutput) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log("Load Test: Execution Flow");
    console.log(`  Base URL:       ${BASE_URL}`);
    console.log(`  Concurrency:    ${CONCURRENCY}`);
    console.log(`  Total requests: ${TOTAL_REQUESTS}`);
    console.log(`  Elapsed:        ${elapsedMs}ms`);
    console.log(`  Throughput:     ${rps} req/s`);
    console.log(`  Successful:     ${totalOk}`);
    console.log(`  Errors:         ${totalErr}`);
    console.log(`  Latency (P50):  ${p50}ms`);
    console.log(`  Latency (P95):  ${p95}ms`);
    console.log("Step-level status:");
    console.log(`  /api/execute/prepare  - OK: ${stepCounts.prepare.ok}, FAIL: ${stepCounts.prepare.fail}`);
    console.log(`  /api/execute/confirm  - OK: ${stepCounts.confirm.ok}, FAIL: ${stepCounts.confirm.fail}`);
    console.log(`  lifecycle reconcile   - OK: ${stepCounts.reconcile.ok}, FAIL: ${stepCounts.reconcile.fail}`);

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
