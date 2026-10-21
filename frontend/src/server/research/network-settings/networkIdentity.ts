/**
 * Testnet, futurenet, and mainnet stay distinct.
 * No alias collapses one network into another.
 */

import { NetworkSettingsError } from "./errors";

export const NETWORK_IDS = ["testnet", "futurenet", "mainnet"] as const;

export type NetworkId = (typeof NETWORK_IDS)[number];

export type NetworkProfile = {
  id: NetworkId;
  label: string;
  passphrase: string;
  rpcUrl: string;
};

export const NETWORKS: Record<NetworkId, NetworkProfile> = {
  testnet: {
    id: "testnet",
    label: "Testnet",
    passphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
  },
  futurenet: {
    id: "futurenet",
    label: "Futurenet",
    passphrase: "Test SDF Future Network ; October 2022",
    rpcUrl: "https://rpc-futurenet.stellar.org",
  },
  mainnet: {
    id: "mainnet",
    label: "Mainnet",
    passphrase: "Public Global Stellar Network ; September 2015",
    rpcUrl: "https://mainnet.sorobanrpc.com",
  },
};

export function isNetworkId(value: unknown): value is NetworkId {
  return value === "testnet" || value === "futurenet" || value === "mainnet";
}

export function parseNetworkId(value: unknown): NetworkId {
  if (isNetworkId(value)) return value;

  throw new NetworkSettingsError(
    "unknown_network",
    "Network must be testnet, futurenet, or mainnet.",
  );
}

export function assertSameNetwork(left: NetworkId, right: NetworkId, context: string): void {
  if (left === right) return;

  throw new NetworkSettingsError(
    "network_mismatch",
    `${context} cannot mix ${left} with ${right}.`,
    { left, right },
  );
}

/** Refuse a provider whose passphrase belongs to a different network. */
export function assertProviderPassphrase(network: NetworkId, passphrase: string): void {
  if (passphrase === NETWORKS[network].passphrase) return;

  throw new NetworkSettingsError(
    "network_mismatch",
    `${NETWORKS[network].label} passphrase does not match the provider.`,
    { network },
  );
}
