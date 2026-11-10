import { getEvmNetwork, type EvmNetworkConfig } from "@/lib/evm/config";

export function resolveMetamorphicNetwork(network: string): EvmNetworkConfig | null {
  return getEvmNetwork(network) ?? null;
}

export function isSupportedMetamorphicNetwork(network: string): boolean {
  return resolveMetamorphicNetwork(network) !== null;
}
