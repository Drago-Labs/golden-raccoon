import { getAllGates } from "./gates/registry";
import { evaluateReadinessGates } from "./gates/verdict";
import { VerdictReport } from "./gates/types";

export const releaseReadinessChecks = [
  {
    title: "Production env gate",
    detail: "Production deploys require Supabase, provider, app URL, onchain, x402 payment, and social/search configuration before build.",
  },
  {
    title: "Machine-checkable readiness gates",
    detail: "Rollback switches, emergency pause mechanisms, critical route smoke coverage, load performance budgets, and deployment records are verified automatically.",
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
    title: "Contract artifact provenance",
    detail: "EVM creation bytecode and Soroban WASM release artifacts must match a release-approved provenance manifest verified offline.",
  },
  {
    title: "Stellar pubnet readiness gate",
    detail: "Pubnet is refused unless contract identity, x402 payment configuration, RPC provider independence and governance addresses all verify at runtime. The gate fails closed: an unverifiable condition blocks pubnet rather than being assumed satisfied.",
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
    detail: "Correlation IDs link decision→quote→execution. Structured audit events, provider health checks, and runbooks (RB-001 through RB-008) are operational. Disable switches (DISABLE_EXECUTION_PROVIDERS, RECOMMENDATION_ONLY_MODE, etc.) preserve recommendation-only mode.",
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

export type ArtifactProvenanceStatus = "unchecked" | "verified" | "failed";

/**
 * Safe provenance status for readiness/health surfaces.
 * Never returns secrets, paths with credentials, or manifest contents.
 */
export function getArtifactProvenanceHealth(): { status: ArtifactProvenanceStatus } {
  const raw = process.env.ARTIFACT_PROVENANCE_STATUS;
  if (raw === "verified" || raw === "failed" || raw === "unchecked") {
    return { status: raw };
  }
  return { status: "unchecked" };
}

/**
 * Returns static gate definitions for operational display.
 */
export function getRegisteredGates() {
  return getAllGates().map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    severity: g.severity,
  }));
}

/**
 * Evaluates machine-checkable readiness gates asynchronously.
 */
export async function getMachineCheckableReadiness(
  environment = "production",
  commit = "head"
): Promise<VerdictReport> {
  const rootDir = process.cwd().endsWith("frontend") ? ".." : ".";
  return evaluateReadinessGates({
    commit,
    environment,
    rootDir,
  });
}

/**
 * Returns consolidated release readiness health metadata.
 */
export function getReleaseReadinessHealth() {
  return {
    gate: "node scripts/release-gate.mjs",
    productionSmoke: "SMOKE_BASE_URL=https://your-production-domain.example npm run smoke",
    postReleaseMonitor: "MONITOR_BASE_URL=https://your-production-domain.example npm run monitor:production",
    firstMonitoringWindowHours: 24,
    checks: releaseReadinessChecks,
    knownLimitations,
    executionDisableSwitches,
    registeredGates: getRegisteredGates(),
    artifactProvenance: getArtifactProvenanceHealth(),
  };
}
