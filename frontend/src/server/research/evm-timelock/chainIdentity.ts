import { getEvmNetwork, type EvmNetworkConfig } from "@/lib/evm/config";

export function resolveTimelockNetwork(network: string): EvmNetworkConfig | null {
  return getEvmNetwork(network) ?? null;
}

export function isSupportedTimelockNetwork(network: string): boolean {
  return resolveTimelockNetwork(network) !== null;
}
