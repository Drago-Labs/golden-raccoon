export const SUPPORTED_CALL_TREE_NETWORKS = ["stellar-testnet", "stellar-mainnet"] as const;
export type CallTreeNetwork = (typeof SUPPORTED_CALL_TREE_NETWORKS)[number];

export function isSupportedCallTreeNetwork(value: string): value is CallTreeNetwork {
  return (SUPPORTED_CALL_TREE_NETWORKS as readonly string[]).includes(value);
}
