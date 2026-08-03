/**
 * Unified simulation provider factory.
 *
 * Routes a chain-aware `SimulationRequest` to the correct adapter (Soroban
 * RPC or the maintainer-selected EVM provider) and returns a normalized,
 * discriminated `SimulationResult`.  Callers never import chain-specific
 * modules directly.
 *
 * Usage:
 * ```ts
 * import { simulateTransaction } from "@/server/simulation";
 * const result = await simulateTransaction({ chainFamily: "stellar", ... });
 * ```
 */
import type { SimulationRequest, SimulationResult } from "@/server/simulation/types";
import { simulateSorobanTransaction } from "@/server/simulation/soroban";
import { simulateEvmTransaction, getConfiguredEvmSimulationProvider } from "@/server/simulation/evm";

export async function simulateTransaction(request: SimulationRequest): Promise<SimulationResult> {
  if (request.chainFamily === "stellar") {
    return simulateSorobanTransaction(request);
  }

  return simulateEvmTransaction(request);
}

export { simulateSorobanTransaction } from "@/server/simulation/soroban";
export { simulateEvmTransaction, getConfiguredEvmSimulationProvider, decodeRevertReason } from "@/server/simulation/evm";
export { hashPreparedTransaction, hashQuote, sha256Hex, redactSecrets, sanitizeSimulationRequestForLogs } from "@/server/simulation/hash";
export {
  checkSimulationFreshness,
  checkCalldataMatch,
  checkParamsMatch,
  isHighRiskExecution,
} from "@/server/simulation/freshness";

export type {
  SimulationProvider,
  SimulationStatus,
  SimulationRequest,
  SimulationResult,
  StellarSimulationRequest,
  EvmSimulationRequest,
  StellarSimulationResult,
  EvmSimulationResult,
  SimulationBinding,
  SimulationError,
  SimulationErrorCode,
  SimulationBalanceDelta,
  SimulationAllowanceRisk,
  SimulationAuthorizationRisk,
  SimulationFootprint,
  SimulationResourceUsage,
  SimulationExpectedOutput,
  SimulationProviderMeta,
  SimulationProviderConfig,
} from "@/server/simulation/types";

export { isSimulationSuccess, isSimulationFailure, isSimulationUsable, simulationError } from "@/server/simulation/types";

// ─── Provider health ───────────────────────────────────────────────────

export type SimulationProviderHealth = {
  chainFamily: "stellar" | "evm";
  network: string;
  available: boolean;
  provider: string;
  detail: string;
};

export function getSimulationProviderHealth(): SimulationProviderHealth[] {
  const evm = getConfiguredEvmSimulationProvider();

  return [
    {
      chainFamily: "stellar",
      network: "stellar-rpc",
      available: true,
      provider: "soroban_rpc",
      detail: "Soroban RPC simulateTransaction is available for Stellar networks.",
    },
    {
      chainFamily: "evm",
      network: "evm",
      available: evm.available,
      provider: evm.provider,
      detail: evm.detail,
    },
  ];
}
