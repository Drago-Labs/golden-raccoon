import type { AgentResult, PortfolioSnapshot } from "@/server/types";
import { getPortfolioProviderHealth, getPortfolioSnapshot, type PortfolioSnapshotSource } from "@/server/portfolio/getPortfolio";
import { buildAgentResult } from "@/server/agents/shared";

function getProviderSources() {
  const health = getPortfolioProviderHealth();

  return [
    {
      label: "GoldRush/Covalent",
      status: health.goldRush.configured ? "connected" : "unavailable",
      detail: health.goldRush.detail,
    },
    {
      label: "Alchemy",
      status: health.alchemy.configured ? "connected" : "unavailable",
      detail: health.alchemy.detail,
    },
    {
      label: "GOAT RPC",
      status: health.goatRpc.configured ? "connected" : "unavailable",
      detail: health.goatRpc.detail,
    },
  ] as const;
}

function analyzePortfolioSnapshot(portfolio: PortfolioSnapshot, source: PortfolioSnapshotSource): AgentResult {
  const largestHolding = portfolio.holdings.reduce((largest, holding) =>
    holding.allocationPercent > largest.allocationPercent ? holding : largest
  );
  const stablecoinRatio = portfolio.holdings
    .filter((holding) => ["USDC", "USDT", "DAI"].includes(holding.symbol.toUpperCase()))
    .reduce((total, holding) => total + holding.allocationPercent, 0);
  const memeExposure = portfolio.holdings
    .filter((holding) => holding.symbol.toUpperCase().includes("MEME"))
    .reduce((total, holding) => total + holding.allocationPercent, 0);
  const unknownExposure = portfolio.holdings
    .filter((holding) => !holding.isVerified)
    .reduce((total, holding) => total + holding.allocationPercent, 0);
  const volatileExposure = portfolio.holdings
    .filter((holding) => Math.abs(holding.dayChangePercent ?? 0) >= 10)
    .reduce((total, holding) => total + holding.allocationPercent, 0);
  const lowLiquidityExposure = portfolio.holdings
    .filter((holding) => holding.signals.liquidityRisk >= 70)
    .reduce((total, holding) => total + holding.allocationPercent, 0);

  return buildAgentResult({
    agent: "portfolio",
    score: portfolio.riskScore,
    verdict: portfolio.riskScore >= 71 ? "High concentration risk" : "Portfolio within monitoring range",
    summary: `${largestHolding.symbol} is the largest position at ${largestHolding.allocationPercent.toFixed(1)}%. Stablecoin reserve is ${stablecoinRatio.toFixed(1)}%.`,
    findings: [
      {
        label: "Largest holding",
        severity: largestHolding.allocationPercent > 45 ? "high" : "medium",
        detail: `${largestHolding.symbol} represents ${largestHolding.allocationPercent.toFixed(1)}% of the wallet.`,
      },
      {
        label: "Stablecoin reserve",
        severity: stablecoinRatio < 15 ? "high" : "low",
        detail: `USDC reserve is ${stablecoinRatio.toFixed(1)}% of portfolio value.`,
      },
      {
        label: "Meme exposure",
        severity: memeExposure > 20 ? "high" : "medium",
        detail: `Meme exposure is ${memeExposure.toFixed(1)}% across tracked holdings.`,
      },
      {
        label: "Unknown tokens",
        severity: unknownExposure > 15 ? "high" : "low",
        detail: `Unverified token exposure is ${unknownExposure.toFixed(1)}%.`,
      },
      {
        label: "Volatility",
        severity: volatileExposure > 20 ? "high" : "low",
        detail: `${volatileExposure.toFixed(1)}% of the portfolio moved 10% or more in 24h.`,
      },
      {
        label: "Liquidity risk",
        severity: lowLiquidityExposure > 20 ? "high" : "low",
        detail: `${lowLiquidityExposure.toFixed(1)}% of holdings carry elevated liquidity risk.`,
      },
    ],
    sources: [
      {
        label: "Wallet portfolio API",
        status: source.status,
        detail: `${source.detail} Snapshot for ${portfolio.walletAddress}.`,
      },
      ...getProviderSources(),
    ],
    confidence: source.status === "connected" ? 0.76 : 0.58,
    recommendedAction: portfolio.riskScore >= 71 ? "reduce_exposure" : "watch",
  });
}

export async function runPortfolioAgent(walletAddress?: string): Promise<AgentResult> {
  const { portfolio, source } = await getPortfolioSnapshot(walletAddress);

  return analyzePortfolioSnapshot(portfolio, source);
}
