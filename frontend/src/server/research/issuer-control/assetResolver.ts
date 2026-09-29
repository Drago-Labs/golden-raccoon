import { StrKey } from "@stellar/stellar-sdk";
import { parseStellarAssetInput } from "@/server/stellar/assetIdentity";
import type { ResolvedAsset } from "./schema";

const assetCodePattern = /^[a-zA-Z0-9]{1,12}$/;

function classicAsset(
  code: string,
  issuer: string,
  network: "stellar-testnet" | "stellar-pubnet",
  displaySuffix = "",
  contractId: string | null = null,
): ResolvedAsset {
  const normalizedCode = code.trim().toUpperCase();
  const normalizedIssuer = issuer.trim();
  return {
    kind: "classic",
    assetKey: `classic:${normalizedCode}:${normalizedIssuer}`,
    display: `${normalizedCode}:${normalizedIssuer}${displaySuffix}`,
    code: normalizedCode,
    issuer: normalizedIssuer,
    contractId,
    network,
  };
}

function nativeAsset(
  network: "stellar-testnet" | "stellar-pubnet",
  display = "XLM (native)",
  contractId: string | null = null,
): ResolvedAsset {
  return {
    kind: "native",
    assetKey: "native",
    display,
    code: "XLM",
    issuer: null,
    contractId,
    network,
  };
}

/**
 * Resolve asset identity without requiring SAC contractId derivation.
 * Classic CODE:ISSUER is parsed locally so inspector tests stay deterministic
 * under jsdom (stellar-sdk Asset.contractId is environment-sensitive).
 */
export function resolveInspectorAsset(
  assetQuery: string,
  network: "stellar-testnet" | "stellar-pubnet",
): { asset: ResolvedAsset | null; error: string | null } {
  const trimmed = assetQuery.trim();
  if (!trimmed) {
    return { asset: null, error: "Asset identity could not be resolved for this network" };
  }

  if (trimmed.toUpperCase() === "XLM" || trimmed.toLowerCase() === "native") {
    return { asset: nativeAsset(network), error: null };
  }

  if (StrKey.isValidContract(trimmed)) {
    return {
      asset: {
        kind: "soroban_token",
        assetKey: `contract:${trimmed}`,
        display: trimmed,
        code: null,
        issuer: null,
        contractId: trimmed,
        network,
      },
      error: null,
    };
  }

  const separator = trimmed.indexOf(":");
  if (separator > 0) {
    const code = trimmed.slice(0, separator);
    const issuer = trimmed.slice(separator + 1);
    if (assetCodePattern.test(code) && StrKey.isValidEd25519PublicKey(issuer)) {
      return { asset: classicAsset(code, issuer, network), error: null };
    }
  }

  // Fall back to shared identity helper for explorer URLs / SAC forms.
  try {
    const identity = parseStellarAssetInput(trimmed, network);
    if (!identity) {
      return { asset: null, error: "Asset identity could not be resolved for this network" };
    }

    if (identity.type === "native") {
      return { asset: nativeAsset(network, "XLM (native)", identity.contractId), error: null };
    }

    if (identity.type === "classic") {
      return {
        asset: classicAsset(identity.symbol, identity.issuer, network, "", identity.contractId),
        error: null,
      };
    }

    if (identity.type === "deterministic_sac" && identity.underlyingType === "classic" && identity.issuer) {
      return {
        asset: classicAsset(
          identity.symbol,
          identity.issuer,
          network,
          ` (SAC ${identity.contractId})`,
          identity.contractId,
        ),
        error: null,
      };
    }

    if (identity.type === "deterministic_sac" && identity.underlyingType === "native") {
      return {
        asset: nativeAsset(network, `XLM via SAC ${identity.contractId}`, identity.contractId),
        error: null,
      };
    }

    if (identity.type === "sep41_token" || identity.type === "contract" || identity.type === "unsupported_contract") {
      const contractId = identity.contractId;
      return {
        asset: {
          kind: "soroban_token",
          assetKey: identity.assetKey,
          display: contractId,
          code: identity.type === "sep41_token" ? identity.symbol : null,
          issuer: null,
          contractId,
          network,
        },
        error: null,
      };
    }

    if (identity.type === "issuer_account") {
      return {
        asset: null,
        error: "Provide CODE:ISSUER or a contract ID; an issuer account alone is not an asset identity",
      };
    }
  } catch {
    return { asset: null, error: "Asset identity could not be resolved for this network" };
  }

  return { asset: null, error: "Unsupported asset identity" };
}
