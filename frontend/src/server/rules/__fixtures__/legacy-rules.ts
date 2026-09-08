/**
 * Test fixtures representing legacy rules and unparseable edge cases.
 */

export const validLegacyV1Rules = [
  {
    walletAddress: "0x1111111111111111111111111111111111111111",
    profileId: "balanced",
    maxRiskScore: 35,
    maxTradePercent: 10,
    maxTradeValueUsd: 1000,
    maxDailyTransactionValueUsd: 5000,
    minLiquidityUsd: 25000,
    maxSingleTokenExposurePercent: 20,
    minStableReservePercent: 15,
    maxMemeExposurePercent: 10,
    maxSlippageBps: 150,
    allowedChains: ["base", "goat"],
    blockedTokens: ["evm:base:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],
    blockedCategories: ["meme"],
    autoExecute: false,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    walletAddress: "0x2222222222222222222222222222222222222222",
    profileId: "conservative",
    maxBuyRisk: 20,
    maxTradePercent: 5,
    maxTradeValueUsd: 500,
    maxDailyValueUsd: 2000,
    minLiquidityUsd: 50000,
    maxSingleTokenExposurePercent: 15,
    minStableReservePercent: 30,
    maxMemeExposurePercent: 0,
    maxSlippageBps: 50,
    allowedChains: ["ethereum", "stellar-testnet"],
    blockedAssets: ["stellar:classic:USDC:GCO26XZOAAZEMBXUBKOP5Y2D4D3ZNNV65VOKMUDJ5PZJB5F3BFF6IUU6"],
    blockedCategories: ["meme", "unaudited"],
    autoExecute: false,
    version: 1,
    createdAt: "2026-02-01T12:00:00.000Z",
  },
];

export const validCurrentV2Rules = [
  {
    schemaVersion: 2,
    walletAddress: "0x3333333333333333333333333333333333333333",
    profileId: "balanced",
    presetVersion: 1,
    maxBuyRisk: 40,
    maxTradePercent: 10,
    maxTradeValueUsd: 2000,
    maxDailyValueUsd: 10000,
    minLiquidityUsd: 25000,
    maxSingleTokenExposurePercent: 25,
    minStableReservePercent: 20,
    maxMemeExposurePercent: 10,
    maxSlippageBps: 150,
    allowedChains: ["base", "stellar-testnet"],
    blockedAssets: ["evm:base:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],
    blockedCategories: ["meme"],
    allowedActions: ["prepare_transaction", "swap_to_stable"],
    autoExecute: false,
    version: 2,
    createdAt: "2026-03-01T00:00:00.000Z",
  },
];

export const unparseableRuleFixtures = [
  null,
  undefined,
  "not an object",
  12345,
  [],
  {
    schemaVersion: "invalid-string",
    walletAddress: "0x123",
  },
  {
    schemaVersion: 999,
    walletAddress: "0x123",
  },
  {
    walletAddress: "",
    maxBuyRisk: 50,
  },
  {
    walletAddress: "0x123",
    maxBuyRisk: 150,
  },
  {
    walletAddress: "0x123",
    maxTradePercent: -5,
  },
  {
    walletAddress: "0x123",
    autoExecute: true,
  },
  {
    walletAddress: "0x123",
    allowedChains: ["unknown-chain-xyz"],
  },
  {
    walletAddress: "0x123",
    minStableReservePercent: 70,
    maxTradePercent: 40,
  },
];
