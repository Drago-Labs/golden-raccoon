/**
 * Fixtures for spam/dust review. Nothing touches a network or provider.
 */
import type { SpamDustRequest } from "@/server/research/spam-dust-review/schema";

const GENERATED_AT = "2026-01-20T12:00:00.000Z";
const WALLET = "GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCD";

export const spamLikeFixtures: SpamDustRequest = {
  walletId: WALLET,
  chainId: "stellar-pubnet",
  generatedAt: GENERATED_AT,
  holdings: [
    {
      symbol: "AIRDROP",
      name: "Claim Free Tokens",
      balance: 1_000_000,
      priceUsd: 0.000001,
      valueUsd: 1,
      allocationPercent: 0.01,
      isVerified: false,
      logoUrl: "javascript:alert(1)",
    },
    {
      symbol: "DUST",
      name: "Tiny residual",
      tokenAddress: "CDUSTTOKENADDRESS000000000000000000000000000000000000",
      balance: 0.5,
      priceUsd: 0.5,
      valueUsd: 0.25,
      allocationPercent: 0.05,
      isVerified: true,
    },
    {
      symbol: "USDC",
      name: "USD Coin",
      issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      balance: 100,
      priceUsd: 1,
      valueUsd: 100,
      allocationPercent: 40,
      isVerified: true,
    },
  ],
};

/** High balance, no price — must not be classified as dust. */
export const highValueUnpriced: SpamDustRequest = {
  walletId: WALLET,
  chainId: "stellar-pubnet",
  generatedAt: GENERATED_AT,
  holdings: [
    {
      symbol: "RARE",
      name: "Rare unpriced position",
      issuer: "GRAREISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      balance: 50_000,
      priceUsd: null,
      valueUsd: 0,
      allocationPercent: 0,
      isVerified: true,
    },
  ],
};

/** Same symbol on two chains — preferences must not share. */
export const sameSymbolDifferentChains: SpamDustRequest = {
  walletId: WALLET,
  chainId: "stellar-pubnet",
  generatedAt: GENERATED_AT,
  holdings: [
    {
      symbol: "USDC",
      name: "USD Coin",
      chainId: "stellar-pubnet",
      issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      balance: 10,
      priceUsd: 1,
      valueUsd: 10,
      isVerified: true,
    },
    {
      symbol: "USDC",
      name: "USD Coin",
      chainId: "ethereum",
      tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      balance: 10,
      priceUsd: 1,
      valueUsd: 10,
      isVerified: true,
    },
  ],
  preferences: [
    {
      assetKey: "stellar-pubnet|USDC||GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN|",
      hidden: true,
      updatedAt: GENERATED_AT,
    },
  ],
};

export const preferenceRoundTrip: SpamDustRequest = {
  walletId: WALLET,
  chainId: "stellar-pubnet",
  generatedAt: GENERATED_AT,
  holdings: [
    {
      symbol: "DUST",
      name: "Tiny residual",
      tokenAddress: "CDUST",
      balance: 1,
      priceUsd: 0.1,
      valueUsd: 0.1,
      allocationPercent: 0.05,
      isVerified: true,
    },
  ],
  preferences: [
    {
      assetKey: "stellar-pubnet|DUST|cdust||",
      hidden: true,
      updatedAt: GENERATED_AT,
    },
  ],
};

export const providerFailure: SpamDustRequest = {
  walletId: WALLET,
  chainId: "stellar-pubnet",
  generatedAt: GENERATED_AT,
  providerStatus: "unavailable",
  holdings: [
    {
      symbol: "XLM",
      name: "Lumens",
      balance: 100,
      priceUsd: 0.1,
      valueUsd: 10,
      isVerified: true,
    },
  ],
};

export const emptyWallet: SpamDustRequest = {
  walletId: WALLET,
  chainId: "stellar-pubnet",
  generatedAt: GENERATED_AT,
  holdings: [],
};

export const falsePositiveVerified: SpamDustRequest = {
  walletId: WALLET,
  chainId: "stellar-pubnet",
  generatedAt: GENERATED_AT,
  holdings: [
    {
      symbol: "USDC",
      name: "USD Coin",
      issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      balance: 250,
      priceUsd: 1,
      valueUsd: 250,
      allocationPercent: 55,
      isVerified: true,
      logoUrl: "https://www.circle.com/usdc-logo.png",
    },
  ],
};
