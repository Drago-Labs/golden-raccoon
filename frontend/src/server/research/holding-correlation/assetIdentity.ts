const SUPPORTED_NETWORKS = new Set([
  "ethereum",
  "base",
  "arbitrum",
  "optimism",
  "polygon",
  "stellar-mainnet",
  "stellar-testnet",
]);

export function isSupportedCorrelationNetwork(network: string): boolean {
  return SUPPORTED_NETWORKS.has(network.trim().toLowerCase());
}

export function normalizeAssetId(assetId: string): string {
  return assetId.trim().toUpperCase();
}
