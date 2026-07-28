import "server-only";

import { randomUUID } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";
import type { PortfolioSnapshot, TokenHolding, TokenSignal } from "@/server/types";
import { getRiskLevel, scorePortfolioRisk, scoreTokenRisk } from "@/server/portfolio/riskScoring";
import { canonicalClassicAssetKey } from "@/server/stellar/assetIdentity";
import { requireStellarNetwork } from "@/server/stellar/client";
import {
  buildAccountLedgerKey,
  StellarRpcDataLayer,
} from "@/server/stellar/dataLayer";
import {
  HorizonAccountDataAdapter,
  type StellarAccountDataAdapter,
} from "@/server/stellar/horizonAdapter";

const officialUsdcIssuers = {
  "stellar-testnet": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  "stellar-pubnet": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
} as const;

type HorizonBalance = {
  asset_type: string;
  balance: string;
  buying_liabilities?: string;
  selling_liabilities?: string;
  asset_code?: string;
  asset_issuer?: string;
  limit?: string;
  is_authorized?: boolean;
  is_authorized_to_maintain_liabilities?: boolean;
  is_clawback_enabled?: boolean;
};

function signalsForStellarHolding(input: {
  allocationPercent: number;
  isAuthorized: boolean;
  clawbackEnabled: boolean;
  verified: boolean;
  priced: boolean;
}): TokenSignal {
  return {
    scamRisk: input.verified ? 8 : 36,
    websiteTrustRisk: input.verified ? 8 : 35,
    contractRisk: input.clawbackEnabled ? 48 : input.isAuthorized ? 18 : 70,
    whaleSellRisk: 30,
    liquidityRisk: input.priced ? 18 : 55,
    xSentimentRisk: 25,
    holderConcentrationRisk: 35,
    priceVolatilityRisk: input.priced ? 12 : 45,
    portfolioExposureRisk: Math.min(100, Math.round(input.allocationPercent)),
  };
}
async function getXlmPrice() {
  const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd&include_24hr_change=true", {
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as { stellar?: { usd?: number; usd_24h_change?: number } };

  return payload.stellar?.usd ? payload.stellar : null;
}

export async function getStellarPortfolio(
  walletAddress: string,
  networkId: string,
  adapters: {
    accountData?: StellarAccountDataAdapter;
    rpc?: StellarRpcDataLayer;
  } = {},
): Promise<PortfolioSnapshot | null> {
  if (!StrKey.isValidEd25519PublicKey(walletAddress)) return null;

  const canonicalWallet = walletAddress.toUpperCase();
  const network = requireStellarNetwork(networkId);
  const accountData = adapters.accountData ?? new HorizonAccountDataAdapter();
  const rpcData = adapters.rpc ?? new StellarRpcDataLayer(network.id);
  const requestId = randomUUID();
  const startedAt = performance.now();
  const [accountResult, rpcAccountResult, xlmPriceResult] = await Promise.allSettled([
    accountData.loadAccount(canonicalWallet, network.id, requestId),
    rpcData.getLedgerEntries([buildAccountLedgerKey(canonicalWallet)], {
      requestId,
    }),
    getXlmPrice(),
  ]);

  if (accountResult.status !== "fulfilled" || rpcAccountResult.status !== "fulfilled") return null;

  const account = accountResult.value.value;
  const xlmMarket = xlmPriceResult.status === "fulfilled" ? xlmPriceResult.value : null;
  const balances = account.balances as HorizonBalance[];
  const preliminary = balances.map((balance) => {
    const native = balance.asset_type === "native";
    const code = native ? "XLM" : balance.asset_code ?? "UNKNOWN";
    const issuer = native ? undefined : balance.asset_issuer?.toUpperCase();
    const officialUsdc = code === "USDC" && issuer === officialUsdcIssuers[network.id];
    const verified = native || officialUsdc;
    const priceUsd = native ? xlmMarket?.usd ?? 0 : officialUsdc ? 1 : 0;
    const amount = Number(balance.balance);
    const valueUsd = amount * priceUsd;

    return {
      tokenAddress: native ? "native" : canonicalClassicAssetKey(code, issuer ?? "unknown"),
      symbol: code,
      name: native ? "Stellar Lumens" : officialUsdc ? "USD Coin" : `${code} issued asset`,
      chainId: network.id,
      chainName: network.name,
      isVerified: verified,
      balance: amount,
      priceUsd,
      valueUsd,
      allocationPercent: 0,
      riskScore: 0,
      riskLevel: "medium" as const,
      signals: signalsForStellarHolding({
        allocationPercent: 0,
        isAuthorized: balance.is_authorized !== false,
        clawbackEnabled: balance.is_clawback_enabled === true,
        verified,
        priced: priceUsd > 0,
      }),
    } satisfies TokenHolding;
  });
  const totalValueUsd = preliminary.reduce((total, holding) => total + holding.valueUsd, 0);
  const holdings = preliminary.map((holding): TokenHolding => {
    const allocationPercent = totalValueUsd > 0 ? (holding.valueUsd / totalValueUsd) * 100 : 0;
    const signals = {
      ...holding.signals,
      portfolioExposureRisk: Math.min(100, Math.round(allocationPercent)),
    };
    const riskScore = scoreTokenRisk(signals);

    return {
      ...holding,
      allocationPercent,
      signals,
      riskScore,
      riskLevel: getRiskLevel(riskScore),
    };
  }).sort((left, right) => right.valueUsd - left.valueUsd || right.balance - left.balance);
  const nativeHolding = holdings.find((holding) => holding.tokenAddress === "native");
  const unpricedAssetCount = holdings.filter((holding) => holding.priceUsd === 0 && holding.balance > 0).length;

  return {
    walletAddress: canonicalWallet,
    nativeBalance: nativeHolding?.balance ?? 0,
    nativeSymbol: "XLM",
    dayChangePercent: xlmMarket?.usd_24h_change ?? 0,
    totalValueUsd,
    riskScore: scorePortfolioRisk(holdings),
    createdAt: new Date().toISOString(),
    holdings,
    valuationStatus: unpricedAssetCount > 0 ? "partial" : "complete",
    unpricedAssetCount,
    accountSubentryCount: account.subentry_count,
    providerMeta: {
      provider: "stellar_rpc_and_data_api",
      network: network.id,
      latencyMs: Math.round(performance.now() - startedAt),
      requestId: rpcAccountResult.value.meta.requestId,
      reliability: Math.min(
        accountResult.value.meta.reliability,
        rpcAccountResult.value.meta.reliability,
      ),
      fallbackUsed:
        accountResult.value.meta.fallbackUsed ||
        rpcAccountResult.value.meta.fallbackUsed,
    },
  };
}
