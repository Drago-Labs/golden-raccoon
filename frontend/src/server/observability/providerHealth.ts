/**
 * Provider health checks for EVM and Stellar RPC providers.
 * All checks are read-only — no wallet signatures, no transactions.
 * Reports degradation without false success.
 *
 * Issue #18: Provider Health Checks.
 */

import { createEvmPublicClient } from "@/server/transactions/adapters/evm";
import { getStellarRpcHealth } from "@/server/stellar/client";
import { recordAuditEvent, auditProviderHealthCheck, auditProviderDegraded } from "@/server/observability/executionAudit";
import { sharedProviderCircuits, type CircuitState } from "@/server/providers/adapter";
import { redactProviderUrl } from "@/lib/stellar/failover";
import { redactSecrets } from "@/server/observability/logging";

// ── Types ──────────────────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "unavailable" | "unconfigured";

export type ProviderHealthCheck = {
  provider: string;
  family: "evm" | "stellar";
  network: string;
  status: HealthStatus;
  latencyMs?: number;
  detail: string;
  checkedAt: string;
  error?: string;
  score?: number;
  circuitState?: CircuitState;
};

export type ProviderHealthSnapshot = {
  evm: ProviderHealthCheck[];
  stellar: ProviderHealthCheck[];
  checkedAt: string;
  overallStatus: HealthStatus;
  circuits: ReturnType<typeof getProviderCircuitHealth>;
};

export function getProviderCircuitHealth() {
  return sharedProviderCircuits.snapshots().map((circuit) => {
    const latencyPenalty = Math.min(35, circuit.averageLatencyMs / 100);
    const errorPenalty = circuit.errorRate * 55;
    const statePenalty = circuit.state === "open" ? 40 : circuit.state === "half_open" ? 20 : 0;
    return {
      provider: redactSecrets(circuit.key),
      state: circuit.state,
      sampleCount: circuit.sampleCount,
      errorRate: Number(circuit.errorRate.toFixed(3)),
      averageLatencyMs: circuit.averageLatencyMs,
      score: Math.max(0, Math.round(100 - latencyPenalty - errorPenalty - statePenalty)),
    };
  });
}

// ── Disable switches ───────────────────────────────────────────────

/**
 * Returns true when execution providers are disabled at the environment
 * level. When disabled, the system runs recommendation-only — all agent
 * analysis, risk scoring, and preview preparation continue to work, but
 * no provider-dependent execution paths are attempted.
 */
export function areExecutionProvidersDisabled(): boolean {
  return (
    Boolean(process.env.DISABLE_EXECUTION_PROVIDERS) ||
    Boolean(process.env.RECOMMENDATION_ONLY_MODE)
  );
}

/**
 * Granular disable switches for individual execution capabilities.
 * All default to `false` — everything is enabled unless explicitly disabled.
 */
export function getExecutionDisableFlags() {
  return {
    all: areExecutionProvidersDisabled(),
    quote: Boolean(process.env.DISABLE_QUOTE_PROVIDER),
    simulation: Boolean(process.env.DISABLE_SIMULATION_PROVIDER),
    evmSubmission: Boolean(process.env.DISABLE_EVM_SUBMISSION),
    stellarSubmission: Boolean(process.env.DISABLE_STELLAR_SUBMISSION),
    confirmationPolling: Boolean(process.env.DISABLE_CONFIRMATION_POLLING),
    supabaseWrites: Boolean(process.env.DISABLE_SUPABASE_WRITES),
    x402Settlement: Boolean(process.env.DISABLE_X402_SETTLEMENT),
    recommendationOnly: Boolean(process.env.RECOMMENDATION_ONLY_MODE),
  };
}

// ── EVM Health Check ───────────────────────────────────────────────

export async function checkEvmProviderHealth(params: {
  network: string;
  rpcUrl?: string;
  chainId?: number;
}): Promise<ProviderHealthCheck> {
  const startedAt = Date.now();
  const provider = "evm_rpc";
  const network = params.network;

  try {
    const client = createEvmPublicClient({
      network,
      chainId: params.chainId,
      rpcUrl: params.rpcUrl,
    });

    if (!client) {
      return {
        provider,
        family: "evm",
        network,
        status: "unconfigured",
        detail: `EVM client could not be created for ${network}. Check RPC URL configuration.`,
        checkedAt: new Date().toISOString(),
      };
    }

    const blockNumber = await client.getBlockNumber();
    const latencyMs = Date.now() - startedAt;

    recordAuditEvent(auditProviderHealthCheck({
      correlationId: `health_evm_${network}`,
      provider: `evm_rpc_${network}`,
      providerUrl: params.rpcUrl ? redactProviderUrl(params.rpcUrl) : undefined,
      chainFamily: "evm",
      network,
      healthy: true,
      latencyMs,
    }));

    return {
      provider,
      family: "evm",
      network,
      status: "healthy",
      latencyMs,
      detail: `EVM RPC healthy at block ${blockNumber} (${latencyMs}ms).`,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);

    recordAuditEvent(auditProviderDegraded({
      correlationId: `health_evm_${network}`,
      provider: `evm_rpc_${network}`,
      providerUrl: params.rpcUrl ? redactProviderUrl(params.rpcUrl) : undefined,
      chainFamily: "evm",
      network,
      reason: message,
    }));

    return {
      provider,
      family: "evm",
      network,
      status: "unavailable",
      latencyMs,
      detail: `EVM RPC is unavailable for ${network}.`,
      error: redactSecrets(message),
      checkedAt: new Date().toISOString(),
    };
  }
}

// ── Stellar Health Check ───────────────────────────────────────────

export async function checkStellarProviderHealth(params: {
  network: string;
}): Promise<ProviderHealthCheck> {
  const startedAt = Date.now();

  try {
    const health = await getStellarRpcHealth(params.network);
    const isOutage = health.outage?.isOutage;
    const bestScore = health.providers.length > 0
      ? Math.max(...health.providers.map((p) => p.score ?? (p.healthy ? 85 : 0)))
      : undefined;
    const status: HealthStatus = isOutage
      ? "unavailable"
      : health.healthy
        ? "healthy"
        : "degraded";

    const detail = isOutage
      ? `Stellar RPC network-wide outage for ${params.network}: ${health.outage?.reason ?? "all endpoints down"}`
      : health.healthy
        ? `Stellar RPC healthy at ledger ${health.latestLedger} (${latencyMs}ms).`
        : `Stellar RPC degraded: status=${health.status}, ledger=${health.latestLedger}.`;

    recordAuditEvent(auditProviderHealthCheck({
      correlationId: `health_stellar_${params.network}`,
      provider: "stellar_rpc",
      providerUrl: health.providerUrl ? redactProviderUrl(health.providerUrl) : undefined,
      chainFamily: "stellar",
      network: params.network,
      healthy: health.healthy && !isOutage,
      latencyMs,
    }));

    return {
      provider: "stellar_rpc",
      family: "stellar",
      network: params.network,
      status,
      latencyMs,
      score: bestScore,
      detail,
      checkedAt: health.checkedAt,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);

    recordAuditEvent(auditProviderDegraded({
      correlationId: `health_stellar_${params.network}`,
      provider: "stellar_rpc",
      chainFamily: "stellar",
      network: params.network,
      reason: message,
    }));

    return {
      provider: "stellar_rpc",
      family: "stellar",
      network: params.network,
      status: "unavailable",
      latencyMs,
      detail: `Stellar RPC is unavailable for ${params.network}.`,
      error: redactSecrets(message),
      checkedAt: new Date().toISOString(),
    };
  }
}

// ── Aggregate health ───────────────────────────────────────────────

const DEFAULT_EVM_NETWORKS = ["goat"];
const DEFAULT_STELLAR_NETWORKS = ["stellar-testnet"];

export async function getProviderHealthSnapshot(options?: {
  evmNetworks?: string[];
  stellarNetworks?: string[];
}): Promise<ProviderHealthSnapshot> {
  const evmNetworks = options?.evmNetworks ?? DEFAULT_EVM_NETWORKS;
  const stellarNetworks = options?.stellarNetworks ?? DEFAULT_STELLAR_NETWORKS;

  const [evm, stellar] = await Promise.all([
    Promise.all(evmNetworks.map((network) => checkEvmProviderHealth({ network }))),
    Promise.all(stellarNetworks.map((network) => checkStellarProviderHealth({ network }))),
  ]);

  const all = [...evm, ...stellar];
  const anyUnavailable = all.some((check) => check.status === "unavailable");
  const anyDegraded = all.some((check) => check.status === "degraded");
  const overallStatus: HealthStatus = anyUnavailable ? "unavailable" : anyDegraded ? "degraded" : "healthy";

  return {
    evm,
    stellar,
    checkedAt: new Date().toISOString(),
    overallStatus,
    circuits: getProviderCircuitHealth(),
  };
}

/**
 * Synchronous health snapshot based on configuration only (non-blocking).
 * Returns what SHOULD be available without making live RPC calls.
 */
export function getConfiguredProviderHealth(): ProviderHealthSnapshot {
  const goatRpcUrl = process.env.GOAT_RPC_URL ?? process.env.NEXT_PUBLIC_GOAT_RPC_URL;
  const stellarRpcUrl = process.env.STELLAR_RPC_URL ?? process.env.NEXT_PUBLIC_STELLAR_TESTNET_RPC_URL;

  const evmConfigured = Boolean(goatRpcUrl);
  const stellarConfigured = Boolean(stellarRpcUrl);

  const evm: ProviderHealthCheck = {
    provider: "evm_rpc",
    family: "evm",
    network: "goat",
    status: evmConfigured ? "healthy" : "unconfigured",
    detail: evmConfigured
      ? "EVM RPC URL is configured. Live health check pending."
      : "No EVM RPC URL configured. Set GOAT_RPC_URL or NEXT_PUBLIC_GOAT_RPC_URL.",
    checkedAt: new Date().toISOString(),
  };

  const stellar: ProviderHealthCheck = {
    provider: "stellar_rpc",
    family: "stellar",
    network: "stellar-testnet",
    status: stellarConfigured ? "healthy" : "unconfigured",
    detail: stellarConfigured
      ? "Stellar RPC URL is configured. Live health check pending."
      : "No Stellar RPC URL configured. Set STELLAR_RPC_URL or NEXT_PUBLIC_STELLAR_TESTNET_RPC_URL.",
    checkedAt: new Date().toISOString(),
  };

  const all = [evm, stellar];
  const anyUnavailable = all.some((check) => check.status === "unavailable" || check.status === "unconfigured");

  return {
    evm: [evm],
    stellar: [stellar],
    checkedAt: new Date().toISOString(),
    overallStatus: anyUnavailable ? "unavailable" : "healthy",
    circuits: getProviderCircuitHealth(),
  };
}
