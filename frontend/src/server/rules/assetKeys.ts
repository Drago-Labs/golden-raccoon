/**
 * Chain-aware blocked-asset keys.
 *
 * A blocked asset must be unambiguous across chains: `0xA0b8…` on Ethereum and
 * the same byte string on Base are different assets, and Stellar has three
 * distinct asset shapes that are not addresses at all. Every blocked entry is
 * therefore stored in a canonical, prefixed form.
 *
 * Canonical forms
 * ---------------
 * - `evm:<chain>:<lowercased 0x address>` — an EVM token on one named chain.
 * - `stellar:native`                      — native XLM.
 * - `stellar:classic:<CODE>:<ISSUER>`     — a classic Stellar asset.
 * - `stellar:contract:<C…>`               — a Soroban contract asset.
 *
 * The two Stellar payload forms reuse `canonicalClassicAssetKey` and
 * `canonicalContractAssetKey` from the scan pipeline, so a blocked asset and a
 * scanned asset compare equal without a translation step.
 */

import { StrKey } from "@stellar/stellar-sdk";
import { isAddress as isEvmAddress } from "viem";
import { canonicalClassicAssetKey, canonicalContractAssetKey } from "@/server/stellar/assetIdentity";
import { scanNetworks } from "@/lib/scanNetworks";

export type BlockedAssetKind = "evm_token" | "stellar_native" | "stellar_classic" | "stellar_contract";

export type BlockedAsset = {
  /** Canonical, storage-safe key. */
  key: string;
  kind: BlockedAssetKind;
  chainFamily: "evm" | "stellar";
  /** Scan-network id for EVM entries; `undefined` for Stellar entries, which are network-agnostic. */
  chain?: string;
  /** Human-facing label for the editor. */
  label: string;
};

export class BlockedAssetKeyError extends Error {
  constructor(
    readonly input: string,
    message: string,
  ) {
    super(message);
    this.name = "BlockedAssetKeyError";
  }
}

const ASSET_CODE_PATTERN = /^[A-Z0-9]{1,12}$/;

const evmChainIds = new Set(
  scanNetworks.filter((network) => network.chainFamily !== "stellar").map((network) => network.id),
);

/** Scan-network ids that a blocked EVM asset may be scoped to. */
export function listBlockableEvmChains(): string[] {
  return [...evmChainIds];
}

function parseEvmKey(input: string, parts: string[]): BlockedAsset {
  // evm:<chain>:<address>
  if (parts.length !== 3) {
    throw new BlockedAssetKeyError(input, "EVM asset keys must be evm:<chain>:<address>");
  }

  const [, chain, address] = parts;
  const normalizedChain = chain.trim().toLowerCase();

  if (!evmChainIds.has(normalizedChain)) {
    throw new BlockedAssetKeyError(input, `Unknown EVM chain "${chain}"`);
  }

  if (!isEvmAddress(address.trim())) {
    throw new BlockedAssetKeyError(input, `"${address}" is not a valid EVM address`);
  }

  const normalizedAddress = address.trim().toLowerCase();

  return {
    key: `evm:${normalizedChain}:${normalizedAddress}`,
    kind: "evm_token",
    chainFamily: "evm",
    chain: normalizedChain,
    label: `${normalizedChain} ${normalizedAddress.slice(0, 6)}…${normalizedAddress.slice(-4)}`,
  };
}

function parseStellarPayload(input: string, payload: string[]): BlockedAsset {
  const [head, ...rest] = payload;
  const kind = head.trim().toLowerCase();

  if (kind === "native") {
    if (rest.length > 0) {
      throw new BlockedAssetKeyError(input, "stellar:native takes no further segments");
    }

    return {
      key: "stellar:native",
      kind: "stellar_native",
      chainFamily: "stellar",
      label: "XLM (native)",
    };
  }

  if (kind === "classic") {
    if (rest.length !== 2) {
      throw new BlockedAssetKeyError(input, "Classic asset keys must be classic:CODE:ISSUER");
    }

    const [rawCode, rawIssuer] = rest;
    const code = rawCode.trim().toUpperCase();
    const issuer = rawIssuer.trim().toUpperCase();

    if (!ASSET_CODE_PATTERN.test(code)) {
      throw new BlockedAssetKeyError(input, `"${rawCode}" is not a valid Stellar asset code`);
    }

    if (!StrKey.isValidEd25519PublicKey(issuer)) {
      throw new BlockedAssetKeyError(input, `"${rawIssuer}" is not a valid Stellar issuer account`);
    }

    return {
      key: `stellar:${canonicalClassicAssetKey(code, issuer)}`,
      kind: "stellar_classic",
      chainFamily: "stellar",
      label: `${code}:${issuer.slice(0, 4)}…${issuer.slice(-4)}`,
    };
  }

  if (kind === "contract") {
    if (rest.length !== 1) {
      throw new BlockedAssetKeyError(input, "Contract asset keys must be contract:C…");
    }

    const contractId = rest[0].trim().toUpperCase();

    if (!StrKey.isValidContract(contractId)) {
      throw new BlockedAssetKeyError(input, `"${rest[0]}" is not a valid Soroban contract id`);
    }

    return {
      key: `stellar:${canonicalContractAssetKey(contractId)}`,
      kind: "stellar_contract",
      chainFamily: "stellar",
      label: `${contractId.slice(0, 6)}…${contractId.slice(-4)}`,
    };
  }

  throw new BlockedAssetKeyError(input, `Unknown Stellar asset form "${head}"`);
}

/**
 * Parse any accepted input into a canonical blocked asset.
 *
 * Accepts the canonical forms above and the two unprefixed shorthands users
 * paste most often: a bare `classic:CODE:ISSUER` / `contract:C…` (Stellar is
 * inferred, matching the scan pipeline's own key format) and a bare `native`.
 *
 * A bare EVM address is deliberately rejected — without a chain it is
 * ambiguous, and silently guessing a chain would block the wrong asset.
 *
 * @throws {BlockedAssetKeyError} when the input cannot be resolved.
 */
export function parseBlockedAssetKey(raw: string): BlockedAsset {
  const input = raw.trim();

  if (!input) {
    throw new BlockedAssetKeyError(raw, "Blocked asset key must not be empty");
  }

  const parts = input.split(":");
  const prefix = parts[0].trim().toLowerCase();

  if (prefix === "evm") {
    return parseEvmKey(input, parts);
  }

  if (prefix === "stellar") {
    if (parts.length < 2) {
      throw new BlockedAssetKeyError(input, "Stellar asset keys need a form after stellar:");
    }

    return parseStellarPayload(input, parts.slice(1));
  }

  // Unprefixed Stellar shorthands, matching the scan pipeline's asset keys.
  if (prefix === "native" || prefix === "classic" || prefix === "contract") {
    return parseStellarPayload(input, parts);
  }

  if (isEvmAddress(input)) {
    throw new BlockedAssetKeyError(
      input,
      "A bare EVM address is ambiguous across chains. Use evm:<chain>:<address>",
    );
  }

  throw new BlockedAssetKeyError(input, `Unrecognized asset key "${input}"`);
}

/** Convenience wrapper returning the canonical key only. */
export function normalizeBlockedAssetKey(raw: string): string {
  return parseBlockedAssetKey(raw).key;
}

export type BlockedAssetListResult = {
  assets: BlockedAsset[];
  /** Canonical keys, de-duplicated, in first-seen order. */
  keys: string[];
  errors: { input: string; message: string }[];
};

/**
 * Parse a whole blocked list, collecting every failure rather than stopping at
 * the first, so the editor can mark all bad rows at once.
 */
export function parseBlockedAssetList(raw: string[]): BlockedAssetListResult {
  const assets: BlockedAsset[] = [];
  const keys: string[] = [];
  const errors: { input: string; message: string }[] = [];

  for (const entry of raw) {
    try {
      const asset = parseBlockedAssetKey(entry);

      if (!keys.includes(asset.key)) {
        keys.push(asset.key);
        assets.push(asset);
      }
    } catch (error) {
      errors.push({
        input: entry,
        message: error instanceof Error ? error.message : "Invalid asset key",
      });
    }
  }

  return { assets, keys, errors };
}
