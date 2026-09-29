/**
 * Network-scoped identity keys so symbol collisions and testnet/pubnet
 * records never collapse into one identity.
 */
import { StrKey } from "@stellar/stellar-sdk";
import type { StellarNetworkShort } from "./schema";

const assetCodePattern = /^[a-zA-Z0-9]{1,12}$/;

export function normalizeNetworkShort(value: string): StellarNetworkShort | null {
  const normalized = value.trim().toLowerCase();

  if (["testnet", "stellar-testnet", "stellar:testnet"].includes(normalized)) return "testnet";
  if (["pubnet", "stellar-pubnet", "stellar:pubnet", "mainnet", "stellar-mainnet"].includes(normalized)) {
    return "pubnet";
  }

  return null;
}

export function normalizeAssetCode(code: string): string | null {
  const trimmed = code.trim().toUpperCase();
  return assetCodePattern.test(trimmed) ? trimmed : null;
}

export function normalizeIssuer(issuer: string): string | null {
  const trimmed = issuer.trim().toUpperCase();
  return StrKey.isValidEd25519PublicKey(trimmed) ? trimmed : null;
}

/**
 * Canonical key: `stellar:{network}:{CODE}:{ISSUER}`.
 *
 * Two assets that share a symbol on different networks, or two issuers of the
 * same code on one network, produce distinct keys. Symbol alone is never a key.
 */
export function buildMetadataIdentityKey(input: {
  network: StellarNetworkShort;
  assetCode: string;
  issuer: string;
}): string {
  return `stellar:${input.network}:${input.assetCode}:${input.issuer}`;
}

export function horizonBaseUrl(network: StellarNetworkShort): string {
  return network === "testnet" ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org";
}

export function horizonAccountUrl(network: StellarNetworkShort, issuer: string): string {
  return `${horizonBaseUrl(network)}/accounts/${issuer}`;
}
