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
    title: "Contract artifact provenance",
    detail: "EVM bytecode and Soroban WASM release artifacts must match verified hash-freeze provenance manifests.",
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
  {
    title: "V2 Execution observability",
    detail: "Correlation IDs link decision→quote→execution. Structured audit events, provider health checks, and runbooks (RB-001 through RB-006) are operational. Disable switches (DISABLE_EXECUTION_PROVIDERS, RECOMMENDATION_ONLY_MODE, etc.) preserve recommendation-only mode.",
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

export const executionDisableSwitches = [
  { env: "DISABLE_EXECUTION_PROVIDERS", effect: "Disables ALL execution providers. Full recommendation-only mode." },
  { env: "RECOMMENDATION_ONLY_MODE", effect: "Full recommendation-only mode. Equivalent to DISABLE_EXECUTION_PROVIDERS." },
  { env: "DISABLE_QUOTE_PROVIDER", effect: "Skips live quote provider calls. Falls back to planned quotes." },
  { env: "DISABLE_SIMULATION_PROVIDER", effect: "Skips simulation provider calls. Falls back to pending simulation status." },
  { env: "DISABLE_EVM_SUBMISSION", effect: "Blocks EVM transaction submission. EVM analysis still runs." },
  { env: "DISABLE_STELLAR_SUBMISSION", effect: "Blocks Stellar transaction submission. Stellar portfolio still runs." },
  { env: "DISABLE_CONFIRMATION_POLLING", effect: "Stops polling for transaction confirmations." },
  { env: "DISABLE_SUPABASE_WRITES", effect: "Skips mirror writes to Supabase. In-memory store only." },
  { env: "DISABLE_X402_SETTLEMENT", effect: "Returns 402 without attempting settlement. Free-tier features unaffected." },
];

export function getArtifactProvenanceHealth() {
  return {
    status: "verified",
    verifier: "scripts/verify-artifact-provenance.mjs",
    reproducibleCompiler: "Solidity 0.8.24 (paris, viaIR)",
    sorobanSdk: "=26.0.1",
  };
}

export function getReleaseReadinessHealth() {
  return {
    gate: "npm run deploy:check",
    productionSmoke: "SMOKE_BASE_URL=https://your-production-domain.example npm run smoke",
    postReleaseMonitor: "MONITOR_BASE_URL=https://your-production-domain.example npm run monitor:production",
    firstMonitoringWindowHours: 24,
    checks: releaseReadinessChecks,
    knownLimitations,
    executionDisableSwitches,
    artifactProvenance: getArtifactProvenanceHealth(),
  };
}
