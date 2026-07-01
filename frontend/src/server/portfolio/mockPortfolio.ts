import type { PortfolioSnapshot, TokenHolding } from "../types";
import { getRiskLevel, scorePortfolioRisk, scoreTokenRisk } from "./riskScoring";

const baseHoldings: Omit<TokenHolding, "riskScore" | "riskLevel">[] = [
  {
    tokenAddress: "0x0000000000000000000000000000000000000a11",
    symbol: "GOAT",
    name: "GOAT Network",
    isVerified: true,
    balance: 1240,
    priceUsd: 0.42,
    valueUsd: 520.8,
    allocationPercent: 36,
    signals: {
      scamRisk: 14,
      websiteTrustRisk: 18,
      contractRisk: 22,
      whaleSellRisk: 18,
      liquidityRisk: 24,
      xSentimentRisk: 22,
      holderConcentrationRisk: 28,
      priceVolatilityRisk: 31,
      portfolioExposureRisk: 36,
    },
  },
  {
    tokenAddress: "0x0000000000000000000000000000000000000b22",
    symbol: "USDC",
    name: "USD Coin",
    isVerified: true,
    balance: 318,
    priceUsd: 1,
    valueUsd: 318,
    allocationPercent: 22,
    signals: {
      scamRisk: 2,
      websiteTrustRisk: 3,
      contractRisk: 4,
      whaleSellRisk: 4,
      liquidityRisk: 3,
      xSentimentRisk: 5,
      holderConcentrationRisk: 8,
      priceVolatilityRisk: 4,
      portfolioExposureRisk: 22,
    },
  },
  {
    tokenAddress: "0x0000000000000000000000000000000000000c33",
    symbol: "MEME",
    name: "Meme Reactor",
    isVerified: false,
    balance: 210000,
    priceUsd: 0.0029,
    valueUsd: 609,
    allocationPercent: 42,
    signals: {
      scamRisk: 86,
      websiteTrustRisk: 78,
      contractRisk: 72,
      whaleSellRisk: 93,
      liquidityRisk: 84,
      xSentimentRisk: 79,
      holderConcentrationRisk: 88,
      priceVolatilityRisk: 81,
      portfolioExposureRisk: 91,
    },
  },
];

export function getMockPortfolio(walletAddress = "0xDemoWallet"): PortfolioSnapshot {
  const holdings = baseHoldings.map((holding) => {
    const riskScore = scoreTokenRisk(holding.signals);

    return {
      ...holding,
      riskScore,
      riskLevel: getRiskLevel(riskScore),
    };
  });

  return {
    walletAddress,
    nativeBalance: 248.42,
    nativeSymbol: "GOAT",
    dayChangePercent: -3.8,
    dayChangeUsd: -57.16,
    totalValueUsd: holdings.reduce((sum, holding) => sum + holding.valueUsd, 0),
    riskScore: scorePortfolioRisk(holdings),
    createdAt: new Date().toISOString(),
    holdings,
  };
}
