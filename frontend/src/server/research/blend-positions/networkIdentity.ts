import { BlendPositionError } from "./errors";

export const SUPPORTED_BLEND_NETWORKS = ["stellar-testnet", "stellar-mainnet"] as const;
export type BlendNetwork = (typeof SUPPORTED_BLEND_NETWORKS)[number];

export const BLEND_NETWORK_PASSPHRASES: Record<BlendNetwork, string> = {
  "stellar-testnet": "Test SDF Network ; September 2015",
  "stellar-mainnet": "Public Global Stellar Network ; September 2015",
};

export function isSupportedBlendNetwork(value: string): value is BlendNetwork {
  return (SUPPORTED_BLEND_NETWORKS as readonly string[]).includes(value);
}

export function assertSamePool(expectedPoolId: string, candidatePoolId: string, context: string): void {
  if (expectedPoolId.trim() !== candidatePoolId.trim()) {
    throw new BlendPositionError(
      `${context} belongs to pool ${candidatePoolId} instead of ${expectedPoolId}; positions across pools are never combined.`,
      "pool_mismatch",
      false,
    );
  }
}
