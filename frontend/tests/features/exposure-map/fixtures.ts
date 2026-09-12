import type { TokenHolding } from "@/server/types";
import type { RelationshipDeclaration } from "@/server/research/exposure-map/schema";

/**
 * Fixture demonstrating shared issuer across Ethereum and Stellar chains with symbol isolation.
 */
export const SHARED_ISSUER_MIXED_CHAIN_HOLDINGS: Partial<TokenHolding>[] = [
  {
    symbol: "USDC",
    name: "USD Coin (Ethereum)",
    tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    chainId: "ethereum",
    chainName: "Ethereum",
    balance: 10000,
    priceUsd: 1.0,
    priceStatus: "priced",
    valueUsd: 10000,
    allocationPercent: 62.5,
  },
  {
    symbol: "USDC",
    name: "USD Coin (Stellar Pubnet)",
    tokenAddress: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    chainId: "stellar-pubnet",
    chainName: "Stellar",
    balance: 5000,
    priceUsd: 1.0,
    priceStatus: "priced",
    valueUsd: 5000,
    allocationPercent: 31.25,
  },
  {
    symbol: "USDC",
    name: "Unrelated Synthetic USDC",
    tokenAddress: "0x1111111111111111111111111111111111111111",
    chainId: "ethereum",
    chainName: "Ethereum",
    balance: 1000,
    priceUsd: 1.0,
    priceStatus: "priced",
    valueUsd: 1000,
    allocationPercent: 6.25,
  },
];

/**
 * Fixture demonstrating nested look-through relationships, recursive cycles, and duplicate edges.
 */
export const NESTED_CYCLE_HOLDINGS: Partial<TokenHolding>[] = [
  {
    symbol: "wstETH",
    name: "Wrapped liquid staked Ether 2.0",
    tokenAddress: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
    chainId: "ethereum",
    chainName: "Ethereum",
    balance: 1.0,
    priceUsd: 2000.0,
    priceStatus: "priced",
    valueUsd: 2000.0,
    allocationPercent: 100.0,
  },
];

export const NESTED_CYCLE_CUSTOM_RELATIONSHIPS: RelationshipDeclaration[] = [
  {
    sourceAssetKey: "underlying:eth",
    targetType: "underlying",
    targetId: "ethereum:evm:0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
    targetName: "Wrapped stETH Cycle Target",
    relationship: "derives_from",
    weight: 1.0,
    provenance: {
      source: "user_declared",
      confidence: 1.0,
      declaredAt: "2026-01-01T00:00:00.000Z",
      verified: false,
    },
  },
];

/**
 * Fixture demonstrating unpriced assets and unmapped relationships.
 */
export const PARTIAL_PRICES_UNRESOLVED_HOLDINGS: Partial<TokenHolding>[] = [
  {
    symbol: "USDC",
    name: "USD Coin",
    tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    chainId: "ethereum",
    chainName: "Ethereum",
    balance: 5000,
    priceUsd: 1.0,
    priceStatus: "priced",
    valueUsd: 5000,
    allocationPercent: 71.43,
  },
  {
    symbol: "UNPRICED",
    name: "Illiquid Governance Token",
    tokenAddress: "0x2222222222222222222222222222222222222222",
    chainId: "ethereum",
    chainName: "Ethereum",
    balance: 10000,
    priceUsd: null,
    priceStatus: "unavailable",
    valueUsd: 0,
    allocationPercent: 0,
  },
  {
    symbol: "MYSTERY",
    name: "Unmapped Protocol Token",
    tokenAddress: "0x3333333333333333333333333333333333333333",
    chainId: "ethereum",
    chainName: "Ethereum",
    balance: 2000,
    priceUsd: 1.0,
    priceStatus: "priced",
    valueUsd: 2000,
    allocationPercent: 28.57,
  },
];

/**
 * Fixture representing an empty portfolio.
 */
export const EMPTY_PORTFOLIO_HOLDINGS: Partial<TokenHolding>[] = [];
