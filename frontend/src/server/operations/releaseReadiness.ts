export const releaseReadinessChecks = [
  {
    title: "Production env gate",
    detail: "Production deploys require Supabase, provider, app URL, onchain, x402 payment, and social/search configuration before build.",
  },
  {
    title: "Supabase migrations",
    detail: "The canonical schema must apply cleanly to a fresh local project and the remote production project.",
  },
  {
    title: "Production smoke test",
    detail: "The deployed URL must pass health, agent, scan, decision, x402 payment-required, and execution prepare smoke checks.",
  },
  {
    title: "Rollback plan",
    detail: "The previous deployment stays available until smoke and the first monitoring pass succeed.",
  },
  {
    title: "Incident response",
    detail: "Provider, Supabase, decision, execution, and secret events have a documented triage path.",
  },
  {
    title: "First 24 hours",
    detail: "Provider failure rate and manual review rate are monitored after release.",
  },
];

export const knownLimitations = [
  "Risk scoring is decision support, not a guaranteed prediction.",
  "Low confidence means evidence is incomplete or weak; it never means safe.",
  "Provider outages can move agents to partial, unavailable, or manual review states.",
  "Social bot and reply analysis depends on configured social/search providers.",
  "News coverage can miss regional, new, or provider-unavailable sources.",
  "Execution plans are approval-only; the server cannot sign user transactions.",
  "Premium deep scan requires x402 payment; GOAT-native x402 depends on confirmed facilitator/network support.",
  "Supabase persistence requires production storage env and applied migrations.",
  "Production health must report no mock fallback usage.",
];

export function getReleaseReadinessHealth() {
  return {
    gate: "npm run deploy:check",
    productionSmoke: "SMOKE_BASE_URL=https://your-production-domain.example npm run smoke",
    postReleaseMonitor: "MONITOR_BASE_URL=https://your-production-domain.example npm run monitor:production",
    firstMonitoringWindowHours: 24,
    checks: releaseReadinessChecks,
    knownLimitations,
  };
}
