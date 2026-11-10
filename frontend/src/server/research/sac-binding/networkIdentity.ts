export const SUPPORTED_SAC_NETWORKS = ["stellar-testnet", "stellar-mainnet"] as const;
export type SacNetwork = (typeof SUPPORTED_SAC_NETWORKS)[number];

export const SAC_NETWORK_PASSPHRASES: Record<SacNetwork, string> = {
  "stellar-testnet": "Test SDF Network ; September 2015",
  "stellar-mainnet": "Public Global Stellar Network ; September 2015",
};

export function isSupportedSacNetwork(value: string): value is SacNetwork {
  return (SUPPORTED_SAC_NETWORKS as readonly string[]).includes(value);
}
