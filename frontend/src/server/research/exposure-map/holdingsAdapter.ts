import type { TokenHolding } from "@/server/types";
import {
  canonicalClassicAssetKey,
  canonicalizeAddress,
  getChainFamily,
  isStellarAccountAddress,
  isStellarContractAddress,
  normalizeNetwork,
} from "@/lib/chainIdentity";
import { isAddress as isEvmAddress } from "viem";
import type { AdaptedHolding } from "./schema";

function finiteNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/**
 * Normalizes chain network names to canonical platform standards across EVM and Stellar ecosystems.
 */
export function normalizeChainNetwork(
  network: string | undefined,
  family: "evm" | "stellar" | "other"
): string {
  const trimmed = network?.trim().toLowerCase() ?? "";

  if (family === "stellar") {
    if (
      trimmed === "stellar-pubnet" ||
      trimmed === "pubnet" ||
      trimmed === "stellar:pubnet" ||
      trimmed === "stellar-mainnet"
    ) {
      return "stellar-pubnet";
    }
    return normalizeNetwork(trimmed || "stellar-pubnet", "stellar");
  }

  if (family === "evm") {
    if (
      trimmed === "1" ||
      trimmed === "eth" ||
      trimmed === "eth-mainnet" ||
      trimmed === "mainnet" ||
      trimmed === "ethereum"
    ) {
      return "ethereum";
    }
    if (trimmed === "8453" || trimmed === "base" || trimmed === "base-mainnet") {
      return "base";
    }
    if (
      trimmed === "42161" ||
      trimmed === "arbitrum" ||
      trimmed === "arbitrum-one" ||
      trimmed === "arbitrum-mainnet"
    ) {
      return "arbitrum";
    }
    if (trimmed === "137" || trimmed === "polygon" || trimmed === "polygon-mainnet") {
      return "polygon";
    }
    if (trimmed === "10" || trimmed === "optimism" || trimmed === "optimism-mainnet") {
      return "optimism";
    }
    return normalizeNetwork(trimmed || "ethereum", "evm");
  }

  return trimmed || "other";
}

/**
 * Resolves a network-scoped canonical asset key for a holding without symbol-based grouping.
 */
export function resolveHoldingAssetKey(
  holding: Partial<TokenHolding>,
  network: string,
  chainFamily: "evm" | "stellar" | "other"
): string {
  if (holding.assetKind === "native" || holding.tokenAddress === "native") {
    return `${network}:${chainFamily}:native`;
  }

  if (chainFamily === "stellar") {
    if (holding.symbol?.toUpperCase() === "XLM") {
      return `${network}:stellar:native`;
    }
    if (holding.issuer && isStellarAccountAddress(holding.issuer)) {
      const code = holding.symbol || "UNKNOWN";
      return `${network}:stellar:${canonicalClassicAssetKey(code, holding.issuer)}`;
    }
    if (holding.contractId && isStellarContractAddress(holding.contractId)) {
      return `${network}:stellar:${canonicalizeAddress(holding.contractId, "stellar")}`;
    }
    if (holding.tokenAddress && isStellarContractAddress(holding.tokenAddress)) {
      return `${network}:stellar:${canonicalizeAddress(holding.tokenAddress, "stellar")}`;
    }
    if (holding.tokenAddress && isStellarAccountAddress(holding.tokenAddress)) {
      const code = holding.symbol || "UNKNOWN";
      return `${network}:stellar:${canonicalClassicAssetKey(code, holding.tokenAddress)}`;
    }
  }

  if (chainFamily === "evm") {
    const address = holding.tokenAddress || holding.contractId;
    if (address && isEvmAddress(address)) {
      return `${network}:evm:${address.toLowerCase()}`;
    }
  }

  const rawAddress = (holding.tokenAddress || holding.contractId || holding.symbol || "unknown").toLowerCase();
  return `${network}:${chainFamily}:${rawAddress}`;
}

/**
 * Adapts raw or snapshot token holdings into canonical, network-scoped holdings.
 */
export function adaptHoldings(
  holdings: Partial<TokenHolding>[],
  fallbackChain?: string
): AdaptedHolding[] {
  return holdings.map((holding) => {
    const chainRaw = holding.chainId || holding.chainName || fallbackChain || "ethereum";
    const family = getChainFamily(chainRaw);
    const network = normalizeChainNetwork(chainRaw, family);
    const assetKey = resolveHoldingAssetKey(holding, network, family);

    const balance = finiteNumber(holding.balance);
    const rawPrice = holding.priceUsd;
    const isPriced =
      holding.priceStatus !== "unavailable" &&
      rawPrice !== null &&
      rawPrice !== undefined &&
      Number.isFinite(Number(rawPrice)) &&
      Number(rawPrice) > 0;

    const priceUsd = isPriced ? Number(rawPrice) : null;
    const priceStatus = isPriced ? "priced" : "unavailable";

    let valueUsd = 0;
    if (isPriced && priceUsd !== null) {
      if (holding.valueUsd !== undefined && Number.isFinite(Number(holding.valueUsd))) {
        valueUsd = finiteNumber(holding.valueUsd);
      } else {
        valueUsd = finiteNumber(balance * priceUsd);
      }
    }

    return {
      assetKey,
      symbol: holding.symbol?.trim() || "UNKNOWN",
      name: holding.name?.trim() || holding.symbol?.trim() || "Unknown Token",
      chainFamily: family,
      network,
      tokenAddress: holding.tokenAddress || holding.contractId || assetKey,
      issuer: holding.issuer,
      contractId: holding.contractId,
      balance,
      priceUsd,
      priceStatus,
      valueUsd,
      allocationPercent: finiteNumber(holding.allocationPercent),
    };
  });
}
