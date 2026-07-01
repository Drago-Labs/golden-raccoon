import { createPublicClient, formatUnits, http, isAddress, type Address } from "viem";
import { goatNetwork } from "@/lib/chains";
import type { PortfolioSnapshot, TokenHolding, TokenSignal } from "../types";
import { getRiskLevel, scorePortfolioRisk, scoreTokenRisk } from "./riskScoring";

type AlchemyTokenBalance = {
  contractAddress: string;
  tokenBalance: string;
};

type AlchemyTokenMetadata = {
  decimals: number | null;
  logo: string | null;
  name: string | null;
  symbol: string | null;
};

type TokenPrice = {
  usd: number;
  usd_24h_change?: number;
};

type GoldRushBalanceItem = {
  contract_address: string;
  contract_name: string | null;
  contract_ticker_symbol: string | null;
  contract_decimals: number | null;
  logo_url: string | null;
  logo_urls?: {
    token_logo_url?: string | null;
    protocol_logo_url?: string | null;
    chain_logo_url?: string | null;
  };
  balance: string;
  quote: number | null;
  quote_24h?: number | null;
  quote_rate: number | null;
  quote_rate_24h?: number | null;
  quote_pct_change_24h?: number | null;
  native_token?: boolean;
  is_native_token?: boolean;
};

type GoldRushBalanceResponse = {
  data?: {
    chain_name?: string;
    items?: GoldRushBalanceItem[];
  };
};

type RawTokenHolding = Omit<TokenHolding, "riskScore" | "riskLevel"> & {
  previousValueUsd?: number;
};

const knownTokenLogoUrls: Record<string, string> = {
  GOAT: "/brand/logo.png",
  ETH: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  WETH: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  USDC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
  USDT: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png",
  BTC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png",
  WBTC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png",
  BNB: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png",
  SOL: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
};

const knownTokenCoinGeckoIds: Record<string, string> = {
  ETH: "ethereum",
  WETH: "ethereum",
  USDC: "usd-coin",
  USDT: "tether",
  BTC: "bitcoin",
  WBTC: "wrapped-bitcoin",
  BNB: "binancecoin",
  SOL: "solana",
};

const verifiedTokenSymbols = new Set([
  "ETH",
  "WETH",
  "USDC",
  "USDT",
  "BTC",
  "WBTC",
  "BNB",
  "SOL",
  "GOAT",
]);

const knownChainLogoUrls: Record<string, string> = {
  ethereum: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  "eth-mainnet": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  base: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png",
  "base-mainnet": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png",
  arbitrum: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png",
  "arbitrum-mainnet": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png",
  "bnb chain": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png",
  "bsc-mainnet": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png",
  solana: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
  "solana-mainnet": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
  bitcoin: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png",
  "bitcoin-mainnet": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png",
};

const goldRushChains = [
  { id: "eth-mainnet", name: "Ethereum" },
  { id: "base-mainnet", name: "Base" },
  { id: "arbitrum-mainnet", name: "Arbitrum" },
  { id: "bsc-mainnet", name: "BNB Chain" },
  { id: "linea-mainnet", name: "Linea" },
  { id: "matic-mainnet", name: "Polygon" },
  { id: "optimism-mainnet", name: "Optimism" },
  { id: "avalanche-mainnet", name: "Avalanche" },
  { id: "fantom-mainnet", name: "Fantom" },
  { id: "gnosis-mainnet", name: "Gnosis" },
  { id: "zora-mainnet", name: "Zora" },
  { id: "scroll-mainnet", name: "Scroll" },
  { id: "mantle-mainnet", name: "Mantle" },
  { id: "blast-mainnet", name: "Blast" },
  { id: "zksync-mainnet", name: "zkSync Era" },
  { id: "polygon-zkevm-mainnet", name: "Polygon zkEVM" },
  { id: "mode-mainnet", name: "Mode" },
  { id: "opbnb-mainnet", name: "opBNB" },
  { id: "celo-mainnet", name: "Celo" },
  { id: "moonbeam-mainnet", name: "Moonbeam" },
  { id: "moonriver-mainnet", name: "Moonriver" },
  { id: "cronos-mainnet", name: "Cronos" },
  { id: "metis-mainnet", name: "Metis" },
  { id: "kava-mainnet", name: "Kava" },
  { id: "aurora-mainnet", name: "Aurora" },
  { id: "boba-mainnet", name: "Boba" },
  { id: "rsk-mainnet", name: "Rootstock" },
  { id: "solana-mainnet", name: "Solana" },
  { id: "bitcoin-mainnet", name: "Bitcoin" },
];

const supportedAlchemyNetworks = {
  ethereum: {
    alchemyPath: "eth-mainnet",
    coinGeckoPlatform: "ethereum",
    nativeSymbol: "ETH",
    nativeName: "Ethereum",
    nativeCoinGeckoId: "ethereum",
    chainLogoUrl: knownChainLogoUrls["eth-mainnet"],
  },
  base: {
    alchemyPath: "base-mainnet",
    coinGeckoPlatform: "base",
    nativeSymbol: "ETH",
    nativeName: "Ethereum",
    nativeCoinGeckoId: "ethereum",
    chainLogoUrl: knownChainLogoUrls["base-mainnet"],
  },
  arbitrum: {
    alchemyPath: "arb-mainnet",
    coinGeckoPlatform: "arbitrum-one",
    nativeSymbol: "ETH",
    nativeName: "Ethereum",
    nativeCoinGeckoId: "ethereum",
    chainLogoUrl: knownChainLogoUrls["arbitrum-mainnet"],
  },
} as const;

type SupportedAlchemyNetwork = keyof typeof supportedAlchemyNetworks;

function getDefaultSignals(allocationPercent: number, dayChangePercent = 0): TokenSignal {
  const volatility = Math.min(100, Math.round(Math.abs(dayChangePercent) * 3));

  return {
    scamRisk: 12,
    websiteTrustRisk: 20,
    contractRisk: 20,
    whaleSellRisk: 20,
    liquidityRisk: 25,
    xSentimentRisk: 25,
    holderConcentrationRisk: 25,
    priceVolatilityRisk: volatility,
    portfolioExposureRisk: Math.min(100, Math.round(allocationPercent)),
  };
}

function withRisk(holding: Omit<TokenHolding, "riskScore" | "riskLevel">): TokenHolding {
  const riskScore = scoreTokenRisk(holding.signals);

  return {
    ...holding,
    riskScore,
    riskLevel: getRiskLevel(riskScore),
  };
}

function normalizeHexBalance(balance: string, decimals: number) {
  return Number(formatUnits(BigInt(balance), decimals));
}

function getPreviousValueFromPercent(valueUsd: number, dayChangePercent?: number | null) {
  if (typeof dayChangePercent !== "number" || !Number.isFinite(dayChangePercent) || dayChangePercent <= -100) {
    return undefined;
  }

  return valueUsd / (1 + dayChangePercent / 100);
}

function getKnownTokenLogoUrl(symbol?: string | null) {
  return symbol ? knownTokenLogoUrls[symbol.toUpperCase()] : undefined;
}

function getKnownChainLogoUrl(chainId?: string, chainName?: string) {
  return knownChainLogoUrls[(chainId ?? "").toLowerCase()] ?? knownChainLogoUrls[(chainName ?? "").toLowerCase()];
}

function isKnownVerifiedToken(symbol?: string | null) {
  return symbol ? verifiedTokenSymbols.has(symbol.toUpperCase()) : false;
}

async function fetchJsonRpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
    next: { revalidate: 30 },
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.status}`);
  }

  const payload = (await response.json()) as { result?: T; error?: { message?: string } };

  if (payload.error || payload.result === undefined) {
    throw new Error(payload.error?.message ?? "RPC request failed");
  }

  return payload.result;
}

async function fetchCoinGeckoTokenPrices(platform: string, contractAddresses: string[]) {
  if (contractAddresses.length === 0) {
    return {} as Record<string, TokenPrice>;
  }

  const url = new URL(`https://api.coingecko.com/api/v3/simple/token_price/${platform}`);
  url.searchParams.set("contract_addresses", contractAddresses.join(","));
  url.searchParams.set("vs_currencies", "usd");
  url.searchParams.set("include_24hr_change", "true");

  const response = await fetch(url, { next: { revalidate: 60 } });

  if (!response.ok) {
    return {};
  }

  return (await response.json()) as Record<string, TokenPrice>;
}

async function fetchCoinGeckoNativePrice(coinId: string) {
  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.searchParams.set("ids", coinId);
  url.searchParams.set("vs_currencies", "usd");
  url.searchParams.set("include_24hr_change", "true");

  const response = await fetch(url, { next: { revalidate: 60 } });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Record<string, TokenPrice>;

  return data[coinId] ?? null;
}

async function fetchCoinGeckoPricesByIds(coinIds: string[]) {
  const ids = [...new Set(coinIds)].filter(Boolean);

  if (ids.length === 0) {
    return {} as Record<string, TokenPrice>;
  }

  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("vs_currencies", "usd");
  url.searchParams.set("include_24hr_change", "true");

  const response = await fetch(url, { next: { revalidate: 60 } });

  if (!response.ok) {
    return {};
  }

  return (await response.json()) as Record<string, TokenPrice>;
}

async function enrichKnownMarketData(holdings: RawTokenHolding[]) {
  const prices = await fetchCoinGeckoPricesByIds(
    holdings
      .map((holding) => knownTokenCoinGeckoIds[holding.symbol.toUpperCase()])
      .filter((coinId): coinId is string => Boolean(coinId)),
  ).catch(() => ({} as Record<string, TokenPrice>));

  return holdings.map((holding): RawTokenHolding => {
    const coinId = knownTokenCoinGeckoIds[holding.symbol.toUpperCase()];
    const market = coinId ? prices[coinId] : undefined;

    if (!market?.usd) {
      return holding;
    }

    const valueUsd = holding.balance * market.usd;
    const dayChangePercent = market.usd_24h_change ?? holding.dayChangePercent ?? 0;
    const previousValueUsd = getPreviousValueFromPercent(valueUsd, dayChangePercent);

    return {
      ...holding,
      priceUsd: market.usd,
      valueUsd,
      previousValueUsd,
      dayChangePercent,
      dayChangeUsd: previousValueUsd === undefined ? undefined : valueUsd - previousValueUsd,
      signals: getDefaultSignals(0, dayChangePercent),
    };
  });
}

async function getGoatNativeHolding(walletAddress: Address): Promise<RawTokenHolding> {
  const client = createPublicClient({
    chain: goatNetwork,
    transport: http(process.env.GOAT_RPC_URL ?? process.env.NEXT_PUBLIC_GOAT_RPC_URL ?? "https://rpc.goat.network"),
  });
  const balance = await client.getBalance({ address: walletAddress });
  const normalizedBalance = Number(formatUnits(balance, goatNetwork.nativeCurrency.decimals));

  return {
    tokenAddress: "native",
    symbol: goatNetwork.nativeCurrency.symbol,
    name: goatNetwork.nativeCurrency.name,
    chainId: String(goatNetwork.id),
    chainName: goatNetwork.name,
    chainLogoUrl: "/brand/logo.png",
    logoUrl: knownTokenLogoUrls.GOAT,
    isVerified: true,
    balance: normalizedBalance,
    priceUsd: 0,
    valueUsd: 0,
    allocationPercent: 0,
    signals: getDefaultSignals(0),
  };
}

async function getAlchemyPortfolioHoldings(walletAddress: Address) {
  const apiKey = process.env.ALCHEMY_API_KEY;
  const network = (process.env.PORTFOLIO_CHAIN ?? "").toLowerCase() as SupportedAlchemyNetwork;
  const config = supportedAlchemyNetworks[network];

  if (!apiKey || !config) {
    return [];
  }

  const rpcUrl = `https://${config.alchemyPath}.g.alchemy.com/v2/${apiKey}`;
  const tokenBalances = await fetchJsonRpc<{ tokenBalances: AlchemyTokenBalance[] }>(
    rpcUrl,
    "alchemy_getTokenBalances",
    [walletAddress, "erc20"],
  );
  const nonZeroBalances = tokenBalances.tokenBalances
    .filter((token) => BigInt(token.tokenBalance) > BigInt(0))
    .slice(0, 40);
  const metadataEntries = await Promise.all(
    nonZeroBalances.map(async (token) => {
      const metadata = await fetchJsonRpc<AlchemyTokenMetadata>(rpcUrl, "alchemy_getTokenMetadata", [
        token.contractAddress,
      ]);

      return [token.contractAddress.toLowerCase(), metadata] as const;
    }),
  );
  const metadataByAddress = Object.fromEntries(metadataEntries);
  const prices = await fetchCoinGeckoTokenPrices(
    config.coinGeckoPlatform,
    nonZeroBalances.map((token) => token.contractAddress),
  );
  const nativeClient = createPublicClient({
    transport: http(rpcUrl),
  });
  const nativeBalance = await nativeClient.getBalance({ address: walletAddress });
  const nativePrice = await fetchCoinGeckoNativePrice(config.nativeCoinGeckoId);
  const nativeDayChangePercent = nativePrice?.usd_24h_change ?? 0;
  const nativeHolding: RawTokenHolding = {
    tokenAddress: "native",
    symbol: config.nativeSymbol,
    name: config.nativeName,
    chainId: network,
    chainName: network,
    chainLogoUrl: config.chainLogoUrl,
    logoUrl: getKnownTokenLogoUrl(config.nativeSymbol),
    isVerified: true,
    balance: Number(formatUnits(nativeBalance, 18)),
    priceUsd: nativePrice?.usd ?? 0,
    valueUsd: Number(formatUnits(nativeBalance, 18)) * (nativePrice?.usd ?? 0),
    previousValueUsd: getPreviousValueFromPercent(
      Number(formatUnits(nativeBalance, 18)) * (nativePrice?.usd ?? 0),
      nativeDayChangePercent,
    ),
    dayChangePercent: nativeDayChangePercent,
    allocationPercent: 0,
    signals: getDefaultSignals(0, nativeDayChangePercent),
  };
  const tokenHoldings = nonZeroBalances.map((token): RawTokenHolding => {
    const address = token.contractAddress.toLowerCase();
    const metadata = metadataByAddress[address];
    const decimals = metadata?.decimals ?? 18;
    const balance = normalizeHexBalance(token.tokenBalance, decimals);
    const price = prices[address]?.usd ?? 0;
    const change = prices[address]?.usd_24h_change ?? 0;
    const valueUsd = balance * price;

    return {
      tokenAddress: token.contractAddress,
      symbol: metadata?.symbol ?? "TOKEN",
      name: metadata?.name ?? metadata?.symbol ?? "Unknown token",
      chainId: network,
      chainName: network,
      chainLogoUrl: config.chainLogoUrl,
      logoUrl: getKnownTokenLogoUrl(metadata?.symbol) ?? metadata?.logo ?? undefined,
      isVerified: isKnownVerifiedToken(metadata?.symbol),
      balance,
      priceUsd: price,
      valueUsd,
      previousValueUsd: getPreviousValueFromPercent(valueUsd, change),
      dayChangePercent: change,
      allocationPercent: 0,
      signals: getDefaultSignals(0, change),
    };
  });

  return [nativeHolding, ...tokenHoldings];
}

async function getGoldRushPortfolioHoldings(walletAddress: Address) {
  const apiKey = process.env.GOLDRUSH_API_KEY ?? process.env.COVALENT_API_KEY;

  if (!apiKey) {
    return [];
  }

  const selectedChains = (process.env.GOLDRUSH_CHAINS ?? goldRushChains.map((chain) => chain.id).join(","))
    .split(",")
    .map((chain) => chain.trim())
    .filter(Boolean);
  const chainNames = Object.fromEntries(goldRushChains.map((chain) => [chain.id, chain.name]));
  const chainHoldings = await Promise.all(
    selectedChains.map(async (chainId) => {
      const url = new URL(`https://api.covalenthq.com/v1/${chainId}/address/${walletAddress}/balances_v2/`);
      url.searchParams.set("no-spam", "true");
      url.searchParams.set("nft", "false");

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        next: { revalidate: 60 },
      });

      if (!response.ok) {
        return [];
      }

      const payload = (await response.json()) as GoldRushBalanceResponse;
      const chainName = chainNames[chainId] ?? payload.data?.chain_name ?? chainId;

      return (payload.data?.items ?? [])
        .filter((item) => BigInt(item.balance || "0") > BigInt(0))
        .map((item): RawTokenHolding => {
          const decimals = item.contract_decimals ?? 18;
          const balance = Number(formatUnits(BigInt(item.balance), decimals));
          const valueUsd = item.quote ?? 0;
          const priceUsd = item.quote_rate ?? (balance > 0 ? valueUsd / balance : 0);
          const isNativeToken = item.is_native_token ?? item.native_token ?? false;
          const symbol = item.contract_ticker_symbol ?? "TOKEN";
          const previousValueUsd =
            item.quote_24h ??
            (typeof item.quote_rate_24h === "number" ? balance * item.quote_rate_24h : undefined) ??
            getPreviousValueFromPercent(valueUsd, item.quote_pct_change_24h);
          const dayChangePercent =
            item.quote_pct_change_24h ??
            (previousValueUsd && previousValueUsd > 0 ? ((valueUsd - previousValueUsd) / previousValueUsd) * 100 : 0);

          return {
            tokenAddress: isNativeToken ? `native:${chainId}` : item.contract_address,
            symbol,
            name: item.contract_name ?? symbol,
            chainId,
            chainName,
            chainLogoUrl: getKnownChainLogoUrl(chainId, chainName) ?? item.logo_urls?.chain_logo_url ?? undefined,
            logoUrl:
              getKnownTokenLogoUrl(symbol) ??
              item.logo_urls?.token_logo_url ??
              item.logo_url ??
              (isNativeToken ? item.logo_urls?.chain_logo_url : undefined) ??
              undefined,
            isVerified: isNativeToken || isKnownVerifiedToken(symbol),
            balance,
            priceUsd,
            valueUsd,
            previousValueUsd,
            dayChangeUsd: previousValueUsd === undefined ? undefined : valueUsd - previousValueUsd,
            dayChangePercent,
            allocationPercent: 0,
            signals: getDefaultSignals(0, dayChangePercent),
          };
        });
    }),
  );

  return enrichKnownMarketData(chainHoldings.flat());
}

function finalizePortfolio(walletAddress: string, rawHoldings: RawTokenHolding[]): PortfolioSnapshot {
  const totalValueUsd = rawHoldings.reduce((sum, holding) => sum + holding.valueUsd, 0);
  const previousTotalValueUsd = rawHoldings.reduce(
    (sum, holding) => sum + (holding.previousValueUsd ?? holding.valueUsd),
    0,
  );
  const dayChangeUsd = totalValueUsd - previousTotalValueUsd;
  const dayChangePercent =
    previousTotalValueUsd > 0 ? Number(((dayChangeUsd / previousTotalValueUsd) * 100).toFixed(2)) : 0;
  const holdings = rawHoldings.map((rawHolding) => {
    const { previousValueUsd, ...holding } = rawHolding;
    const allocationPercent = totalValueUsd > 0 ? Math.round((holding.valueUsd / totalValueUsd) * 100) : 0;
    const signals = {
      ...holding.signals,
      portfolioExposureRisk: allocationPercent,
    };

    return withRisk({
      ...holding,
      dayChangeUsd: previousValueUsd === undefined ? holding.dayChangeUsd : holding.valueUsd - previousValueUsd,
      allocationPercent,
      signals,
    });
  }).sort((a, b) => b.valueUsd - a.valueUsd);
  const native = holdings.find((holding) => holding.tokenAddress.startsWith("native"));

  return {
    walletAddress,
    nativeBalance: native?.balance ?? 0,
    nativeSymbol: native?.symbol ?? "GOAT",
    dayChangePercent,
    dayChangeUsd,
    totalValueUsd,
    riskScore: scorePortfolioRisk(holdings),
    createdAt: new Date().toISOString(),
    holdings,
  };
}

export async function getRealPortfolio(walletAddress: string): Promise<PortfolioSnapshot | null> {
  if (!isAddress(walletAddress)) {
    return null;
  }

  const address = walletAddress as Address;
  const multiChainHoldings = await getGoldRushPortfolioHoldings(address).catch(() => []);

  if (multiChainHoldings.length > 0) {
    return finalizePortfolio(walletAddress, multiChainHoldings);
  }

  const holdings = await getAlchemyPortfolioHoldings(address).catch(() => []);

  if (holdings.length > 0) {
    return finalizePortfolio(walletAddress, holdings);
  }

  const goatNativeHolding = await getGoatNativeHolding(address).catch(() => null);

  if (!goatNativeHolding) {
    return null;
  }

  return finalizePortfolio(walletAddress, [goatNativeHolding]);
}
