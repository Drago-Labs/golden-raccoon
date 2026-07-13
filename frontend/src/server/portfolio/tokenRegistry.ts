export type KnownTokenClass = "native" | "blue_chip" | "stablecoin" | "wrapped" | "meme" | "unknown";

type KnownToken = {
  symbol: string;
  name: string;
  tokenClass: KnownTokenClass;
  coingeckoId?: string;
  addresses?: Record<string, string>;
};

const stablecoinSymbols = new Set(["USDC", "USDT", "DAI"]);
// CoinMarketCap top 20 snapshot, 2026-07-13. Meme assets retain their
// volatility classification and stablecoins still require address verification.
const establishedLargeCapSymbols = new Set([
  "BTC",
  "ETH",
  "USDT",
  "BNB",
  "USDC",
  "XRP",
  "SOL",
  "TRX",
  "HYPE",
  "DOGE",
  "ZEC",
  "LEO",
  "XLM",
  "XMR",
  "ADA",
  "LINK",
  "CC",
  "BCH",
  "DAI",
  "USD1",
]);

const knownTokens: KnownToken[] = [
  {
    symbol: "ETH",
    name: "Ethereum",
    tokenClass: "native",
    coingeckoId: "ethereum",
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    tokenClass: "wrapped",
    coingeckoId: "ethereum",
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    tokenClass: "blue_chip",
    coingeckoId: "bitcoin",
  },
  {
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    tokenClass: "wrapped",
    coingeckoId: "wrapped-bitcoin",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    tokenClass: "stablecoin",
    coingeckoId: "usd-coin",
    addresses: {
      ethereum: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      base: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      arbitrum: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      optimism: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
      polygon: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    },
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    tokenClass: "stablecoin",
    coingeckoId: "tether",
    addresses: {
      ethereum: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      arbitrum: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
      optimism: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
      polygon: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    },
  },
  {
    symbol: "DAI",
    name: "Dai Stablecoin",
    tokenClass: "stablecoin",
    coingeckoId: "dai",
    addresses: {
      ethereum: "0x6b175474e89094c44da98b954eedeac495271d0f",
      polygon: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
    },
  },
  {
    symbol: "BNB",
    name: "BNB",
    tokenClass: "blue_chip",
    coingeckoId: "binancecoin",
  },
  {
    symbol: "SOL",
    name: "Solana",
    tokenClass: "blue_chip",
    coingeckoId: "solana",
  },
  {
    symbol: "GOAT",
    name: "GOAT Network",
    tokenClass: "native",
  },
];

export function getKnownToken(symbol?: string | null) {
  const normalizedSymbol = symbol?.trim().toUpperCase();

  if (!normalizedSymbol) {
    return undefined;
  }

  return knownTokens.find((token) => token.symbol === normalizedSymbol);
}

export function isKnownToken(symbol?: string | null) {
  const normalizedSymbol = symbol?.trim().toUpperCase();

  return Boolean(getKnownToken(symbol) || (normalizedSymbol && establishedLargeCapSymbols.has(normalizedSymbol)));
}

export function isEstablishedLargeCap(symbol?: string | null) {
  const normalizedSymbol = symbol?.trim().toUpperCase();

  return Boolean(normalizedSymbol && establishedLargeCapSymbols.has(normalizedSymbol));
}

export function isKnownHighVolatilitySymbol(symbol?: string | null) {
  const normalizedSymbol = symbol?.trim().toUpperCase();

  return Boolean(normalizedSymbol && ["MEME", "PEPE", "DOGE", "SHIB", "MOON", "AI"].includes(normalizedSymbol));
}

export function isVerifiedStablecoin(symbol?: string | null, chain?: string, tokenAddress?: string) {
  const normalizedSymbol = symbol?.trim().toUpperCase();

  if (!normalizedSymbol || !stablecoinSymbols.has(normalizedSymbol)) {
    return false;
  }

  const token = getKnownToken(normalizedSymbol);

  if (!chain || !tokenAddress || !token?.addresses) {
    return false;
  }

  const normalizedChain = chain.toLowerCase();
  const normalizedAddress = tokenAddress.toLowerCase();

  return Object.entries(token.addresses).some(([chainKey, address]) => normalizedChain.includes(chainKey) && normalizedAddress === address);
}

export function getKnownTokenClass(symbol?: string | null): KnownTokenClass {
  const normalizedSymbol = symbol?.trim().toUpperCase();

  if (isKnownHighVolatilitySymbol(normalizedSymbol)) return "meme";
  if (stablecoinSymbols.has(normalizedSymbol ?? "")) return "stablecoin";

  return getKnownToken(symbol)?.tokenClass ?? (normalizedSymbol && establishedLargeCapSymbols.has(normalizedSymbol) ? "blue_chip" : "unknown");
}
