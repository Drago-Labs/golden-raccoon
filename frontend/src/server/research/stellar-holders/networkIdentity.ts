/**
 * Stellar network identity for holder distribution.
 *
 * An asset is only comparable with itself on one network. Testnet and pubnet
 * keep distinct passphrases and Horizon hosts, and aliases such as `testnet`
 * and `stellar-testnet` resolve to the same id so they cannot be stored apart.
 */
import { getStellarDataApiUrls, getStellarNetwork } from "@/lib/stellar/config";
import type { StellarHolderNetwork } from "./schema";

export type NetworkIdentity = {
  id: StellarHolderNetwork;
  passphrase: string;
  horizonUrls: readonly string[];
};

export function resolveNetworkIdentity(value: string): NetworkIdentity | null {
  const config = getStellarNetwork(value);

  if (!config) return null;
  if (config.id !== "stellar-testnet" && config.id !== "stellar-pubnet") return null;

  return {
    id: config.id,
    passphrase: config.networkPassphrase,
    horizonUrls: getStellarDataApiUrls(config),
  };
}
