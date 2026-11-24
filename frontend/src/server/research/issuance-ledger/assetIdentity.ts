import { StrKey } from "@stellar/stellar-sdk";
import { IssuanceLedgerError } from "./errors";

export type AssetIdentity = {
  code: string;
  issuer: string;
};

export type StellarNetwork = "stellar-testnet" | "stellar-pubnet";

const PASSPHRASE: Record<StellarNetwork, string> = {
  "stellar-testnet": "Test SDF Network ; September 2015",
  "stellar-pubnet": "Public Global Stellar Network ; September 2015",
};

const HORIZON: Record<StellarNetwork, string> = {
  "stellar-testnet": "https://horizon-testnet.stellar.org",
  "stellar-pubnet": "https://horizon.stellar.org",
};

export function horizonBase(network: StellarNetwork): string {
  return HORIZON[network];
}

export function assertNetworkPassphrase(network: StellarNetwork, passphrase: string | undefined): void {
  if (passphrase === undefined) return;
  if (passphrase !== PASSPHRASE[network]) {
    throw new IssuanceLedgerError("invalid_request", "Network passphrase does not match the selected network.");
  }
}

/** Classic issued asset. Code and issuer stay separate; never merge by code alone. */
export function validateAssetIdentity(code: string, issuer: string): AssetIdentity {
  const trimmedCode = code.trim();
  const trimmedIssuer = issuer.trim();

  if (trimmedCode.length === 0 || trimmedCode.length > 12) {
    throw new IssuanceLedgerError("invalid_request", "Asset code must be 1–12 characters.");
  }
  if (!StrKey.isValidEd25519PublicKey(trimmedIssuer)) {
    throw new IssuanceLedgerError("invalid_request", "Expected a valid Stellar issuer account.");
  }
  return { code: trimmedCode, issuer: trimmedIssuer };
}

export function assetKey(asset: AssetIdentity): string {
  return `${asset.code}:${asset.issuer}`;
}

export function matchesAsset(
  fields: { asset_code?: string; asset_issuer?: string; asset_type?: string },
  asset: AssetIdentity,
): boolean {
  if (fields.asset_type === "native") return false;
  return fields.asset_code === asset.code && fields.asset_issuer === asset.issuer;
}
