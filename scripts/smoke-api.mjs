const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
const checks = [
  {
    name: "health",
    path: "/api/health",
    init: { method: "GET" },
    validate: (body) => body.ok === true && body.agentReadiness,
  },
  {
    name: "portfolio unavailable without wallet",
    path: "/api/portfolio",
    init: { method: "GET" },
    validate: (body) => Array.isArray(body.holdings),
  },
  {
    name: "invalid token scan does not mock",
    path: "/api/scan/token",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "not-a-contract", chain: "base" }),
    },
    validate: (body) => body.dataQuality?.mode === "unavailable" && body.dataQuality?.mockSources === 0,
  },
];

for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`, check.init);

  if (!response.ok) {
    throw new Error(`${check.name} failed with HTTP ${response.status}`);
  }

  const body = await response.json();

  if (!check.validate(body)) {
    throw new Error(`${check.name} returned unexpected payload`);
  }

  console.log(`smoke-api: ${check.name} ok`);
}
