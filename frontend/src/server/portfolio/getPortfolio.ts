import type { PortfolioSnapshot } from "@/server/types";
import { getMockPortfolio } from "@/server/portfolio/mockPortfolio";
import { getRealPortfolio } from "@/server/portfolio/realPortfolio";

export type PortfolioSnapshotSource = {
  status: "connected" | "mock";
  provider: "real_portfolio" | "mock_portfolio";
  detail: string;
};

export type PortfolioSnapshotResult = {
  portfolio: PortfolioSnapshot;
  source: PortfolioSnapshotSource;
};

export type PortfolioProviderHealthItem = {
  configured: boolean;
  status: "configured" | "unconfigured";
  detail: string;
};

export type PortfolioProviderHealth = {
  goldRush: PortfolioProviderHealthItem;
  alchemy: PortfolioProviderHealthItem;
  goatRpc: PortfolioProviderHealthItem;
};

export function getPortfolioProviderHealth() {
  const goldRushConfigured = Boolean(process.env.GOLDRUSH_API_KEY ?? process.env.COVALENT_API_KEY);
  const alchemyConfigured = Boolean(process.env.ALCHEMY_API_KEY && process.env.PORTFOLIO_CHAIN);
  const goatRpcConfigured = Boolean(process.env.GOAT_RPC_URL ?? process.env.NEXT_PUBLIC_GOAT_RPC_URL);

  return {
    goldRush: {
      configured: goldRushConfigured,
      status: goldRushConfigured ? "configured" : "unconfigured",
      detail: goldRushConfigured
        ? "GoldRush/Covalent key is configured for multi-chain balances."
        : "Set GOLDRUSH_API_KEY or COVALENT_API_KEY to enable multi-chain balances.",
    },
    alchemy: {
      configured: alchemyConfigured,
      status: alchemyConfigured ? "configured" : "unconfigured",
      detail: alchemyConfigured
        ? `Alchemy is configured for ${process.env.PORTFOLIO_CHAIN}.`
        : "Set ALCHEMY_API_KEY and PORTFOLIO_CHAIN to enable single-chain ERC-20 fallback.",
    },
    goatRpc: {
      configured: goatRpcConfigured,
      status: goatRpcConfigured ? "configured" : "unconfigured",
      detail: goatRpcConfigured
        ? "GOAT RPC is configured for native balance fallback."
        : "Set GOAT_RPC_URL or NEXT_PUBLIC_GOAT_RPC_URL to enable native balance fallback.",
    },
  } satisfies PortfolioProviderHealth;
}

export async function getPortfolioSnapshot(walletAddress?: string): Promise<PortfolioSnapshotResult> {
  if (walletAddress) {
    const realPortfolio = await getRealPortfolio(walletAddress);

    if (realPortfolio) {
      return {
        portfolio: realPortfolio,
        source: {
          status: "connected",
          provider: "real_portfolio",
          detail: "Real portfolio provider returned wallet holdings.",
        },
      };
    }
  }

  return {
    portfolio: getMockPortfolio(walletAddress),
    source: {
      status: "mock",
      provider: "mock_portfolio",
      detail: walletAddress
        ? "Real portfolio provider returned no usable holdings, so fallback data was used."
        : "No wallet address supplied, so demo portfolio data was used.",
    },
  };
}
