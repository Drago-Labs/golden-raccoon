import {
  type VenueSnapshot,
  type AssetIdentifier,
} from "@/server/research/liquidity-depth/schema";

export const XLM_ASSET: AssetIdentifier = {
  symbol: "XLM",
  addressOrCode: "native",
  decimals: 7,
  chainFamily: "stellar",
  network: "stellar-pubnet",
};

export const USDC_STELLAR_ASSET: AssetIdentifier = {
  symbol: "USDC",
  addressOrCode: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  decimals: 7,
  chainFamily: "stellar",
  network: "stellar-pubnet",
};

export const ETH_ASSET: AssetIdentifier = {
  symbol: "ETH",
  addressOrCode: "0x0000000000000000000000000000000000000000",
  decimals: 18,
  chainFamily: "evm",
  network: "ethereum",
};

export const USDC_EVM_ASSET: AssetIdentifier = {
  symbol: "USDC",
  addressOrCode: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  decimals: 6,
  chainFamily: "evm",
  network: "ethereum",
};

/**
 * Hand-calculated order book fixture:
 * Bids:
 * - 0.120: 1,000 XLM (120 USDC)
 * - 0.118: 2,000 XLM (236 USDC)
 * - 0.115: 5,000 XLM (575 USDC)
 * - 0.110: 10,000 XLM (1,100 USDC)
 * Asks:
 * - 0.122: 1,000 XLM (122 USDC)
 * - 0.124: 2,000 XLM (248 USDC)
 * - 0.126: 5,000 XLM (630 USDC)
 * - 0.130: 10,000 XLM (1,300 USDC)
 *
 * Best Bid: 0.120, Best Ask: 0.122
 * Mid Price: (0.120 + 0.122) / 2 = 0.121
 * Spread: 0.122 - 0.120 = 0.002 (0.002 / 0.121 = ~1.65289%)
 */
export const validOrderbookFixture: VenueSnapshot = {
  venueId: "stellar-sdex-xlm-usdc",
  venueName: "Stellar SDEX (Horizon)",
  chainFamily: "stellar",
  network: "stellar-pubnet",
  baseAsset: XLM_ASSET,
  quoteAsset: USDC_STELLAR_ASSET,
  modelType: "orderbook",
  timestamp: new Date().toISOString(),
  ledgerOrBlock: 54_321_000,
  feeBps: 0,
  orderbook: {
    bids: [
      { price: "0.1200000", amount: "1000.0000000" },
      { price: "0.1180000", amount: "2000.0000000" },
      { price: "0.1150000", amount: "5000.0000000" },
      { price: "0.1100000", amount: "10000.0000000" },
    ],
    asks: [
      { price: "0.1220000", amount: "1000.0000000" },
      { price: "0.1240000", amount: "2000.0000000" },
      { price: "0.1260000", amount: "5000.0000000" },
      { price: "0.1300000", amount: "10000.0000000" },
    ],
  },
  isStale: false,
  isTruncated: false,
};

/**
 * Crossed order book fixture (bid price 0.125 > ask price 0.122)
 */
export const crossedOrderbookFixture: VenueSnapshot = {
  ...validOrderbookFixture,
  venueId: "stellar-sdex-crossed",
  orderbook: {
    bids: [{ price: "0.1250000", amount: "1000.0000000" }],
    asks: [{ price: "0.1220000", amount: "1000.0000000" }],
  },
};

/**
 * Empty order book fixture
 */
export const emptyOrderbookFixture: VenueSnapshot = {
  ...validOrderbookFixture,
  venueId: "stellar-sdex-empty",
  orderbook: {
    bids: [],
    asks: [],
  },
};

/**
 * Stale order book fixture (observed 200s ago)
 */
export const staleOrderbookFixture: VenueSnapshot = {
  ...validOrderbookFixture,
  venueId: "stellar-sdex-stale",
  timestamp: new Date(Date.now() - 200_000).toISOString(),
  isStale: true,
};

/**
 * Truncated order book fixture (boundary reached)
 */
export const truncatedOrderbookFixture: VenueSnapshot = {
  ...validOrderbookFixture,
  venueId: "stellar-sdex-truncated",
  isTruncated: true,
};

/**
 * Hand-calculated EVM Constant Product AMM Fixture:
 * Base: ETH (18 decimals), Quote: USDC (6 decimals)
 * Base Reserve: 100 ETH (100 * 10^18)
 * Quote Reserve: 200,000 USDC (200,000 * 10^6)
 * Spot price: 200,000 / 100 = 2,000 USDC/ETH
 * Fee: 30 bps (0.3%)
 */
export const validConstantProductFixture: VenueSnapshot = {
  venueId: "evm-eth-v2-eth-usdc",
  venueName: "Uniswap v2 (Ethereum)",
  chainFamily: "evm",
  network: "ethereum",
  baseAsset: ETH_ASSET,
  quoteAsset: USDC_EVM_ASSET,
  modelType: "constant_product",
  timestamp: new Date().toISOString(),
  ledgerOrBlock: 19_500_000,
  feeBps: 30,
  poolReserves: {
    baseReserve: "100000000000000000000", // 100 ETH
    quoteReserve: "200000000000", // 200,000 USDC
    baseDecimals: 18,
    quoteDecimals: 6,
  },
  isStale: false,
};

/**
 * Zero reserve pool fixture
 */
export const zeroReservePoolFixture: VenueSnapshot = {
  ...validConstantProductFixture,
  venueId: "evm-eth-v2-zero",
  poolReserves: {
    baseReserve: "0",
    quoteReserve: "0",
    baseDecimals: 18,
    quoteDecimals: 6,
  },
};

/**
 * Same asset pair fixture (ETH to ETH)
 */
export const sameAssetFixture: VenueSnapshot = {
  ...validConstantProductFixture,
  venueId: "evm-same-asset",
  quoteAsset: ETH_ASSET,
};

/**
 * Unsupported pool model fixture (e.g. Uniswap v3 concentrated liquidity)
 */
export const unsupportedPoolFixture: VenueSnapshot = {
  venueId: "evm-eth-v3-concentrated",
  venueName: "Uniswap v3 (Ethereum)",
  chainFamily: "evm",
  network: "ethereum",
  baseAsset: ETH_ASSET,
  quoteAsset: USDC_EVM_ASSET,
  modelType: "unsupported",
  unsupportedReason: "Concentrated liquidity (Uniswap v3) pools are not supported.",
  timestamp: new Date().toISOString(),
  ledgerOrBlock: 19_500_000,
  feeBps: 30,
  isStale: false,
};
