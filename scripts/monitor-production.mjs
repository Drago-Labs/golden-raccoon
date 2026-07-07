const baseUrl = process.env.MONITOR_BASE_URL || process.env.SMOKE_BASE_URL;

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

console.log("monitor-production: first 24 hours signal snapshot");
console.log(`monitor-production: provider failure rate ${metrics.providerFailureRate ?? 0}%`);
console.log(`monitor-production: manual review rate ${metrics.manualReviewRate ?? 0}%`);
console.log(`monitor-production: decision error alert ${alerts.decisionErrorRateHigh === true}`);
console.log(`monitor-production: execution confirm failure alert ${alerts.executionConfirmFailureHigh === true}`);
console.log(`monitor-production: sample size ${JSON.stringify(metrics.sampleSize ?? {})}`);

if (body.mockFallbacksEnabled !== false || body.liveModeUsesMockData !== false) {
  throw new Error("monitor-production: production health reports mock fallback usage");
}

if (triggeredAlerts.length > 0) {
  throw new Error(`monitor-production: alert thresholds triggered: ${triggeredAlerts.join(", ")}`);
}

console.log("monitor-production: ok");
