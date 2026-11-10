import type { HeadroomNetwork } from "./networkIdentity";
import type { NetworkLimitSet } from "./schema";

export interface NetworkLimitsProvider {
  readNetworkLimits(input: { network: HeadroomNetwork }): Promise<NetworkLimitSet>;
}

export const DEFAULT_NETWORK_LIMITS: Record<HeadroomNetwork, NetworkLimitSet> = {
  "stellar-testnet": {
    network: "stellar-testnet",
    ledger: 800000,
    limits: {
      instructions: 100_000_000,
      memoryBytes: 41_943_040,
      readEntries: 40,
      writeEntries: 25,
      readBytes: 200_000,
      writeBytes: 66_560,
      txSizeBytes: 71_680,
    },
  },
  "stellar-mainnet": {
    network: "stellar-mainnet",
    ledger: 55000000,
    limits: {
      instructions: 100_000_000,
      memoryBytes: 41_943_040,
      readEntries: 40,
      writeEntries: 25,
      readBytes: 200_000,
      writeBytes: 66_560,
      txSizeBytes: 71_680,
    },
  },
};

export function createDefaultNetworkLimitsReader(): NetworkLimitsProvider {
  return {
    async readNetworkLimits({ network }) {
      return DEFAULT_NETWORK_LIMITS[network];
    },
  };
}
