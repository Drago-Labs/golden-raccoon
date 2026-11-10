import { getEvmNetwork, type EvmNetworkConfig } from "@/lib/evm/config";

export function resolveEnsNetwork(network: string): EvmNetworkConfig | null {
  return getEvmNetwork(network) ?? null;
}

export function isSupportedEnsNetwork(network: string): boolean {
  return resolveEnsNetwork(network) !== null;
}
