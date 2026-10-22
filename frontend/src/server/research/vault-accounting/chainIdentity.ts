/**
 * Resolves which EVM network a request targets. A thin, feature-local
 * wrapper around the shared `@/lib/evm/config` registry so this feature's
 * other modules depend on one name, not the shared module directly.
 */
import { getEvmNetwork, type EvmNetworkConfig } from "@/lib/evm/config";

export function resolveVaultNetwork(network: string): EvmNetworkConfig | null {
  return getEvmNetwork(network) ?? null;
}

export function isSupportedVaultNetwork(network: string): boolean {
  return resolveVaultNetwork(network) !== null;
}
