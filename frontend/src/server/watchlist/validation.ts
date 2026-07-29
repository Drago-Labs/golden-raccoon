/**
 * Validation helpers for accepted watchlist assets.
 *
 * Each chain family has a small set of supported asset types, and every type
 * has its own canonical identifier form. This module is the single source of
 * truth for: "given a client-submitted asset, is it acceptable, and what should
 * we store?" — used by both the POST watchlist route and the storage adapter.
 */
import { StrKey } from "@stellar/stellar-sdk";
import { isAddress as isEvmAddress } from "viem";
import { isStellarAccountAddress, canonicalizeAddress } from "@/lib/chainIdentity";
import { normalizeScanNetworkId, scanNetworks } from "@/lib/scanNetworks";
import type { WatchlistEntry } from "@/server/types";

export type ParseAssetSuccess = {
  ok: true;
  chainFamily: WatchlistEntry["chainFamily"];
  network: string;
  assetType: WatchlistEntry["assetType"];
  assetIdentifier: string;
};

export type ParseAssetError = {
  ok: false;
  code:
    | "invalid_wallet_address"
    | "invalid_chain_family"
    | "invalid_network"
    | "network_family_mismatch"
    | "invalid_asset_type"
    | "asset_type_family_mismatch"
    | "missing_asset_identifier"
    | "invalid_evm_address"
    | "invalid_stellar_classic"
    | "invalid_stellar_contract"
    | "invalid_stellar_native";
  message: string;
};

export type ParseAssetInput = {
  walletAddress: string;
  chainFamily: "evm" | "stellar";
  network: string;
  assetType: WatchlistEntry["assetType"];
  assetIdentifier: string;
};

const evmAssetTypes: WatchlistEntry["assetType"][] = ["evm_contract"];
const stellarAssetTypes: WatchlistEntry["assetType"][] = [
  "stellar_native",
  "stellar_classic",
  "stellar_contract",
];

function familyFromAssetType(assetType: WatchlistEntry["assetType"]): "evm" | "stellar" {
  return assetType === "evm_contract" ? "evm" : "stellar";
}

function validateNetwork(network: string, family: "evm" | "stellar"): { ok: true; id: string } | ParseAssetError {
  if (!network || typeof network !== "string") {
    return { ok: false, code: "invalid_network", message: "Network is required." };
  }

  const id = normalizeScanNetworkId(network);

  if (!id) {
    return { ok: false, code: "invalid_network", message: `Unsupported network "${network}".` };
  }

  const match = scanNetworks.find((candidate) => candidate.id === id);

  if (!match) {
    return { ok: false, code: "invalid_network", message: `Unknown network "${network}".` };
  }

  const networkFamily = match.chainFamily ?? "evm";

  if (networkFamily !== family) {
    return {
      ok: false,
      code: "network_family_mismatch",
      message: `Network "${match.name}" belongs to the ${networkFamily.toUpperCase()} family, not ${family.toUpperCase()}.`,
    };
  }

  return { ok: true, id };
}

function validateWalletForFamily(walletAddress: string, family: "evm" | "stellar"): ParseAssetError | null {
  if (!walletAddress || typeof walletAddress !== "string") {
    return { ok: false, code: "invalid_wallet_address", message: "Wallet address is required." };
  }

  const trimmed = walletAddress.trim();

  if (!trimmed) {
    return { ok: false, code: "invalid_wallet_address", message: "Wallet address is required." };
  }

  if (family === "stellar") {
    if (!isStellarAccountAddress(trimmed)) {
      return {
        ok: false,
        code: "invalid_wallet_address",
        message: "Stellar watchlist requires a valid G-address (Ed25519 public key).",
      };
    }
  } else if (!isEvmAddress(trimmed)) {
    return {
      ok: false,
      code: "invalid_wallet_address",
      message: "EVM watchlist requires a valid 0x-prefixed 20-byte address.",
    };
  }

  return null;
}

function canonicalizeEvmAddress(value: string): string {
  return value.trim().toLowerCase();
}

function canonicalizeStellarClassic(value: string): { ok: true; id: string } | ParseAssetError {
  const trimmed = value.trim();
  const parts = trimmed.split(":");

  if (parts.length !== 2) {
    return {
      ok: false,
      code: "invalid_stellar_classic",
      message: "Stellar classic assets must be formatted as CODE:ISSUER.",
    };
  }

  const [rawCode, rawIssuer] = parts;
  const code = rawCode.trim().toUpperCase();
  const issuer = rawIssuer.trim().toUpperCase();

  // Stellar asset codes are 1–12 characters; alphanumeric.
  if (!/^[A-Z0-9]{1,12}$/.test(code)) {
    return {
      ok: false,
      code: "invalid_stellar_classic",
      message: "Asset code must be 1–12 uppercase alphanumeric characters.",
    };
  }

  if (!StrKey.isValidEd25519PublicKey(issuer)) {
    return {
      ok: false,
      code: "invalid_stellar_classic",
      message: "Issuer must be a valid Stellar G-address (Ed25519 public key).",
    };
  }

  return { ok: true, id: `${code}:${issuer}` };
}

function canonicalizeStellarContract(value: string): { ok: true; id: string } | ParseAssetError {
  const trimmed = value.trim().toUpperCase();

  // StrKey.isValidContract rejects lowercase versions; uppercase the input first.
  if (!StrKey.isValidContract(trimmed)) {
    return {
      ok: false,
      code: "invalid_stellar_contract",
      message: "Soroban contract address must be a valid C-address (C… base32).",
    };
  }

  return { ok: true, id: trimmed };
}

function normalizeNative(input?: string): string {
  // Native XLM has no contract; canonical form is the literal "native".
  return "native";
}

/**
 * Validates a submitted asset and returns either a canonical WatchlistEntry
 * payload or a stable error code suitable for surfacing to the API caller.
 */
export function parseWatchlistAsset(input: ParseAssetInput): ParseAssetSuccess | ParseAssetError {
  if (input.chainFamily !== "evm" && input.chainFamily !== "stellar") {
    return { ok: false, code: "invalid_chain_family", message: "Chain family must be evm or stellar." };
  }

  const walletError = validateWalletForFamily(input.walletAddress, input.chainFamily);

  if (walletError) return walletError;

  if (
    !evmAssetTypes.includes(input.assetType as never) &&
    !stellarAssetTypes.includes(input.assetType as never)
  ) {
    return { ok: false, code: "invalid_asset_type", message: "Unsupported asset type." };
  }

  // Asset types are tightly bound to a chain family. Reject cross-family typos
  // (e.g. stellar_classic on an EVM network).
  if (familyFromAssetType(input.assetType) !== input.chainFamily) {
    return {
      ok: false,
      code: "asset_type_family_mismatch",
      message: `Asset type ${input.assetType} requires chain family ${familyFromAssetType(input.assetType)}, not ${input.chainFamily}.`,
    };
  }

  const networkResult = validateNetwork(input.network, input.chainFamily);

  if (!networkResult.ok) return networkResult;

  let identifier: string;

  switch (input.assetType) {
    case "evm_contract": {
      if (!input.assetIdentifier || !input.assetIdentifier.trim()) {
        return { ok: false, code: "missing_asset_identifier", message: "Contract address is required." };
      }

      const candidate = canonicalizeEvmAddress(input.assetIdentifier);

      if (!isEvmAddress(candidate)) {
        return {
          ok: false,
          code: "invalid_evm_address",
          message: "EVM contract must be a valid 0x-prefixed 20-byte address.",
        };
      }

      identifier = candidate;
      break;
    }
    case "stellar_native": {
      if (input.assetIdentifier && input.assetIdentifier.trim() && input.assetIdentifier.trim().toLowerCase() !== "xlm" && input.assetIdentifier.trim().toLowerCase() !== "native") {
        return {
          ok: false,
          code: "invalid_stellar_native",
          message: "Native XLM does not accept an asset identifier. Leave it empty or use 'XLM'.",
        };
      }

      identifier = normalizeNative(input.assetIdentifier);
      break;
    }
    case "stellar_classic": {
      if (!input.assetIdentifier || !input.assetIdentifier.trim()) {
        return {
          ok: false,
          code: "missing_asset_identifier",
          message: "Stellar classic asset must be formatted as CODE:ISSUER.",
        };
      }

      const result = canonicalizeStellarClassic(input.assetIdentifier);

      if (!result.ok) return result;

      identifier = result.id;
      break;
    }
    case "stellar_contract": {
      if (!input.assetIdentifier || !input.assetIdentifier.trim()) {
        return {
          ok: false,
          code: "missing_asset_identifier",
          message: "Soroban contract address is required.",
        };
      }

      const result = canonicalizeStellarContract(input.assetIdentifier);

      if (!result.ok) return result;

      identifier = result.id;
      break;
    }
    default:
      return { ok: false, code: "invalid_asset_type", message: "Unsupported asset type." };
  }

  return {
    ok: true,
    chainFamily: input.chainFamily,
    network: networkResult.id,
    assetType: input.assetType,
    assetIdentifier: identifier,
  };
}

/**
 * Derives the canonical identity tuple for duplicate detection.
 * Includes `network` so the same EVM contract on different chains is treated
 * as a distinct watchlist entry.
 */
export function buildWatchlistIdentity(input: {
  walletAddress: string;
  chainFamily: WatchlistEntry["chainFamily"];
  network: string;
  assetIdentifier: string;
}): { wallet: string; chainFamily: string; network: string; assetIdentifier: string } {
  return {
    wallet: canonicalizeAddress(input.walletAddress, input.chainFamily),
    chainFamily: input.chainFamily,
    network: input.network,
    assetIdentifier: input.assetIdentifier,
  };
}

export function identityKey(identity: ReturnType<typeof buildWatchlistIdentity>) {
  return `${identity.wallet}|${identity.chainFamily}|${identity.network}|${identity.assetIdentifier}`;
}
