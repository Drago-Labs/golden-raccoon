export type EvmNetworkConfig = {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
};

const EVM_NETWORKS: Record<string, EvmNetworkConfig> = {
  "goat": {
    id: "goat",
    name: "GOAT Network",
    chainId: 48816,
    rpcUrl: process.env.GOAT_RPC_URL ?? process.env.NEXT_PUBLIC_GOAT_RPC_URL ?? "https://rpc.goat.network",
    explorerUrl: process.env.NEXT_PUBLIC_GOAT_EXPLORER_URL ?? "https://explorer.goat.network",
  },
  "ethereum": {
    id: "ethereum",
    name: "Ethereum",
    chainId: 1,
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    explorerUrl: "https://etherscan.io",
  },
  "base": {
    id: "base",
    name: "Base",
    chainId: 8453,
    rpcUrl: "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
  },
  "bsc": {
    id: "bsc",
    name: "BNB Chain",
    chainId: 56,
    rpcUrl: "https://bsc-dataseed.binance.org",
    explorerUrl: "https://bscscan.com",
  },
  "arbitrum": {
    id: "arbitrum",
    name: "Arbitrum",
    chainId: 42161,
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    explorerUrl: "https://arbiscan.io",
  },
  "polygon": {
    id: "polygon",
    name: "Polygon",
    chainId: 137,
    rpcUrl: "https://polygon-bor-rpc.publicnode.com",
    explorerUrl: "https://polygonscan.com",
  },
  "optimism": {
    id: "optimism",
    name: "Optimism",
    chainId: 10,
    rpcUrl: "https://mainnet.optimism.io",
    explorerUrl: "https://optimistic.etherscan.io",
  },
  "avalanche": {
    id: "avalanche",
    name: "Avalanche",
    chainId: 43114,
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    explorerUrl: "https://snowtrace.io",
  },
};

export function getEvmNetwork(network: string): EvmNetworkConfig | undefined {
  const normalized = network.trim().toLowerCase();
  return EVM_NETWORKS[normalized];
}

export function resolveEvmRpcUrl(network: string, override?: string): string {
  if (override) return override;
  const config = getEvmNetwork(network);
  return config?.rpcUrl ?? process.env.GOAT_RPC_URL ?? process.env.NEXT_PUBLIC_GOAT_RPC_URL ?? "https://rpc.goat.network";
}

export function resolveEvmChainId(network: string): number | undefined {
  const config = getEvmNetwork(network);
  return config?.chainId;
}
