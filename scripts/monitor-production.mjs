#!/usr/bin/env node

const baseUrl = process.env.MONITOR_BASE_URL || process.env.SMOKE_BASE_URL;
const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");

if (!baseUrl) {
  throw new Error("monitor-production: set MONITOR_BASE_URL or SMOKE_BASE_URL to the deployed app URL");
}

const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/health`, {
  method: "GET",
  headers: { Accept: "application/json" },
});

if (!response.ok) {
  throw new Error(`monitor-production: health endpoint failed with HTTP ${response.status}`);
}

const body = await response.json();
const metrics = body.metrics ?? {};
const alerts = body.alerts?.status ?? {};
const triggeredAlerts = Object.entries(alerts)
  .filter(([, active]) => active === true)
  .map(([name]) => name);
const providerCircuits = Array.isArray(body.providerCircuits) ? body.providerCircuits : [];
const openCircuits = providerCircuits.filter((circuit) => circuit.state === "open");

if (body.mockFallbacksEnabled !== false || body.liveModeUsesMockData !== false) {
  throw new Error("monitor-production: production health reports mock fallback usage");
}

if (triggeredAlerts.length > 0) {
  throw new Error(`monitor-production: alert thresholds triggered: ${triggeredAlerts.join(", ")}`);
}

if (providerCircuits.length > 0 && openCircuits.length === providerCircuits.length) {
  throw new Error("monitor-production: every tracked provider circuit is open");
}

const serializedHealth = JSON.stringify({
  providerCircuits,
  providerHealth: body.productionHealth?.providerHealth,
});
if (
  /https?:\/\/[^/@\s]+@|[?&](?:token|key|api_key|secret)=|\bG[A-Z2-7]{55}\b|\b0x[a-fA-F0-9]{40}\b/.test(
    serializedHealth
  )
) {
  throw new Error("monitor-production: provider health leaked credentials or wallet identifiers");
}

let criticalBurn = false;
if (body.slos) {
  for (const slo of body.slos) {
    if (slo.insufficientData) continue;
    if (slo.burnRateShort > 10 || slo.burnRateLong > 10) {
      criticalBurn = true;
    }
  }
}

const payload = {
  suite: "monitor-production",
  targetUrl: baseUrl,
  metrics,
  alerts,
  triggeredAlerts,
  providerCircuits: {
    total: providerCircuits.length,
    open: openCircuits.length,
  },
  criticalBurn,
  ok: !criticalBurn,
};

if (jsonOutput) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log("monitor-production: first 24 hours signal snapshot");
  console.log(`monitor-production: provider failure rate ${metrics.providerFailureRate ?? 0}%`);
  console.log(`monitor-production: manual review rate ${metrics.manualReviewRate ?? 0}%`);
  console.log(`monitor-production: decision error alert ${alerts.decisionErrorRateHigh === true}`);
  console.log(
    `monitor-production: execution confirm failure alert ${alerts.executionConfirmFailureHigh === true}`
  );
  console.log(`monitor-production: sample size ${JSON.stringify(metrics.sampleSize ?? {})}`);
  console.log(
    `monitor-production: provider circuits ${providerCircuits.length}, open ${openCircuits.length}`
  );
  if (criticalBurn) {
    console.error("monitor-production: critical burn rate detected across monitored SLOs");
  } else {
    console.log("monitor-production: ok");
  }
}

if (criticalBurn) {
  process.exit(1);
}
