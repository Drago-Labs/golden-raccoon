/**
 * Canonical identity of an issued classic asset.
 *
 * Stellar asset codes are case-sensitive, so this module does not uppercase
 * them. The result key always includes the network and the issuer: `USD` from
 * two issuers is two assets, and the same pair on testnet and pubnet is two
 * assets as well.
 */
import { StrKey } from "@stellar/stellar-sdk";
import type { CanonicalAsset, StellarHolderNetwork } from "./schema";

const assetCodePattern = /^[A-Za-z0-9]{1,12}$/;

export function assetResultKey(network: StellarHolderNetwork, code: string, issuer: string): string {
  return `${network}|${code}|${issuer}`;
}

export function parseAssetIdentity(
  input: string,
  network: StellarHolderNetwork,
): { ok: true; asset: CanonicalAsset } | { ok: false; message: string } {
  const trimmed = input.trim();
  const separator = trimmed.indexOf(":");

  if (separator <= 0 || separator !== trimmed.lastIndexOf(":")) {
    return { ok: false, message: "Issued assets use canonical CODE:ISSUER." };
  }

  const code = trimmed.slice(0, separator).trim();
  const issuer = trimmed.slice(separator + 1).trim();

  if (!assetCodePattern.test(code)) {
    return { ok: false, message: "The asset code must be 1 to 12 letters or digits." };
  }

  if (!StrKey.isValidEd25519PublicKey(issuer)) {
    return { ok: false, message: "The issuer is not a Stellar account id." };
  }

  return {
    ok: true,
    asset: {
      code,
      issuer,
      network,
      canonical: `${code}:${issuer}`,
      resultKey: assetResultKey(network, code, issuer),
    },
  };
}
