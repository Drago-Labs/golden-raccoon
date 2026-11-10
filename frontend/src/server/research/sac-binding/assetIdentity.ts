import { StrKey } from "@stellar/stellar-sdk";
import { SacBindingError } from "./errors";
import type { ClassicAssetDescriptor } from "./schema";

export function parseClassicAsset(rawInput: string): ClassicAssetDescriptor {
  const trimmed = rawInput.trim();
  if (trimmed.toLowerCase() === "native" || trimmed.toUpperCase() === "XLM") {
    return {
      assetType: "native",
      code: "XLM",
      issuer: null,
      canonical: "native",
    };
  }

  const parts = trimmed.split(":");
  if (parts.length !== 2) {
    throw new SacBindingError(
      "Asset must be 'native' or 'CODE:ISSUER'",
      "invalid_asset",
      false,
    );
  }
  const code = parts[0]!.trim();
  const issuer = parts[1]!.trim();

  if (!/^[a-zA-Z0-9]{1,12}$/.test(code)) {
    throw new SacBindingError(
      "Asset code must be 1 to 12 alphanumeric characters",
      "invalid_asset",
      false,
    );
  }
  if (!StrKey.isValidEd25519PublicKey(issuer)) {
    throw new SacBindingError(
      "Asset issuer must be a valid Stellar Ed25519 public key (G...)",
      "invalid_asset",
      false,
    );
  }

  return {
    assetType: code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12",
    code,
    issuer,
    canonical: `${code}:${issuer}`,
  };
}
