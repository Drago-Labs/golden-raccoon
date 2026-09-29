/**
 * Fixtures for the liquidity depth workbench.
 *
 * Every number here is chosen so the expected result can be worked out by hand
 * and asserted exactly. The arithmetic for each case is written out in the
 * comments beside it, so a reviewer can check the maths without running the
 * code. No fixture touches a network or a paid provider.
 */
import type { LiquidityRequest } from "@/server/research/liquidity-depth/schema";

const NOW = "2026-01-05T12:00:00.000Z";
const FRESH = "2026-01-05T11:59:30.000Z";
const STALE = "2026-01-05T11:00:00.000Z";

/** 7-decimal Stellar asset. */
const XLM = { chainId: "stellar-pubnet", symbol: "XLM", decimals: 7 };
/** 7-decimal classic asset with an issuer. */
const USDC_STELLAR = {
  chainId: "stellar-pubnet",
  symbol: "USDC",
  decimals: 7,
  issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
};
/** 18-decimal EVM asset, to prove precision survives normalization. */
const WETH = { chainId: "ethereum", symbol: "WETH", decimals: 18, contractAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" };
const USDC_EVM = { chainId: "ethereum", symbol: "USDC", decimals: 6, contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" };

/**
 * Order book with three bid levels, no fee.
 *
 * Selling 150 XLM (1_500_000_000 base units at 7 decimals):
 *   100 XLM @ 0.50 =  50.0 USDC  ->   500_000_000 units
 *    50 XLM @ 0.49 =  24.5 USDC  ->   245_000_000 units
 *                     ---------
 *   total          =  74.5 USDC  ->   745_000_000 units
 *   effective price = 74.5 / 150 = 0.496666666666666666
 *   impact vs 0.50  = (0.50 - 0.4966..) / 0.50 = 66 bps (truncated)
 */
export const orderbookMultipleLevels: LiquidityRequest = {
  side: "sell_base",
  now: NOW,
  ladder: ["1000000000", "1500000000", "5000000000"],
  venues: [
    {
      venueId: "stellar-sdex",
      label: "Stellar SDEX",
      model: "orderbook",
      base: XLM,
      quote: USDC_STELLAR,
      observedAt: FRESH,
      ledgerOrBlock: "54321000",
      feeBps: 0,
      truncated: false,
      bids: [
        { price: "0.50", baseAmount: "1000000000" },
        { price: "0.49", baseAmount: "1000000000" },
        { price: "0.45", baseAmount: "1000000000" },
      ],
      asks: [
        { price: "0.51", baseAmount: "1000000000" },
        { price: "0.53", baseAmount: "1000000000" },
      ],
    },
  ],
};

/**
 * Constant-product pool: 1000 WETH / 3_000_000 USDC, 30 bps fee.
 * Spot price is 3000 USDC per WETH.
 *
 * Selling 1 WETH (10^18 base units):
 *   dx_net = 10^18 * 9970 / 10000       = 997_000_000_000_000_000
 *   dy     = y * dx_net / (x + dx_net)
 *          = 3_000_000_000_000 * 997_000_000_000_000_000
 *            / 1_000_997_000_000_000_000_000
 *          = 2_988_020_943 USDC base units (2988.020943 USDC)
 *
 * Selling 10 WETH:
 *   dx_net = 9_970_000_000_000_000_000
 *   dy     = 3_000_000_000_000 * 9_970_000_000_000_000_000
 *            / 1_009_970_000_000_000_000_000
 *          = 29_614_741_031 USDC base units (29614.741031 USDC)
 */
export const constantProductFeeAndRounding: LiquidityRequest = {
  side: "sell_base",
  now: NOW,
  ladder: ["1000000000000000000", "10000000000000000000"],
  venues: [
    {
      venueId: "uniswap-v2-weth-usdc",
      label: "Uniswap V2 WETH/USDC",
      model: "constant_product",
      base: WETH,
      quote: USDC_EVM,
      observedAt: FRESH,
      ledgerOrBlock: "21000000",
      feeBps: 30,
      truncated: false,
      baseReserve: "1000000000000000000000",
      quoteReserve: "3000000000000",
    },
  ],
};

/** Stale snapshot, truncated source, and a model this workbench cannot read. */
export const staleTruncatedUnsupported: LiquidityRequest = {
  side: "sell_base",
  now: NOW,
  ladder: ["1000000000"],
  venues: [
    {
      venueId: "stale-book",
      label: "Stale order book",
      model: "orderbook",
      base: XLM,
      quote: USDC_STELLAR,
      observedAt: STALE,
      feeBps: 0,
      truncated: true,
      bids: [{ price: "0.50", baseAmount: "1000000000" }],
      asks: [],
    },
    {
      venueId: "exotic-amm",
      label: "Exotic concentrated AMM",
      model: "unsupported_model",
      base: XLM,
      quote: USDC_STELLAR,
      observedAt: FRESH,
      ledgerOrBlock: "54321000",
      feeBps: 5,
      truncated: false,
    },
  ],
};

/** Best bid at or above best ask: the snapshot is internally inconsistent. */
export const crossedBook: LiquidityRequest = {
  side: "sell_base",
  now: NOW,
  ladder: ["1000000000"],
  venues: [
    {
      venueId: "crossed",
      label: "Crossed book",
      model: "orderbook",
      base: XLM,
      quote: USDC_STELLAR,
      observedAt: FRESH,
      feeBps: 0,
      truncated: false,
      bids: [{ price: "0.55", baseAmount: "1000000000" }],
      asks: [{ price: "0.50", baseAmount: "1000000000" }],
    },
  ],
};

/** A pool with a zero reserve has no curve at all. */
export const zeroReservePool: LiquidityRequest = {
  side: "sell_base",
  now: NOW,
  ladder: ["1000000000000000000"],
  venues: [
    {
      venueId: "empty-pool",
      label: "Drained pool",
      model: "constant_product",
      base: WETH,
      quote: USDC_EVM,
      observedAt: FRESH,
      feeBps: 30,
      truncated: false,
      baseReserve: "0",
      quoteReserve: "3000000000000",
    },
  ],
};

/** A venue that is valid but carries no levels on the taker's side. */
export const emptyBook: LiquidityRequest = {
  side: "sell_base",
  now: NOW,
  ladder: ["1000000000"],
  venues: [
    {
      venueId: "empty-book",
      label: "Empty book",
      model: "orderbook",
      base: XLM,
      quote: USDC_STELLAR,
      observedAt: FRESH,
      ledgerOrBlock: "54321000",
      feeBps: 0,
      truncated: false,
      bids: [],
      asks: [{ price: "0.51", baseAmount: "1000000000" }],
    },
  ],
};

/** Same symbol on two networks, to prove identity keys never collapse. */
export const sameSymbolTwoNetworks: LiquidityRequest = {
  side: "sell_base",
  now: NOW,
  ladder: ["1000000"],
  venues: [
    {
      venueId: "stellar-usdc",
      label: "Stellar USDC book",
      model: "orderbook",
      base: USDC_STELLAR,
      quote: XLM,
      observedAt: FRESH,
      ledgerOrBlock: "54321000",
      feeBps: 0,
      truncated: false,
      bids: [{ price: "2.00", baseAmount: "100000000" }],
      asks: [],
    },
    {
      venueId: "evm-usdc",
      label: "Ethereum USDC book",
      model: "orderbook",
      base: USDC_EVM,
      quote: WETH,
      observedAt: FRESH,
      ledgerOrBlock: "21000000",
      feeBps: 0,
      truncated: false,
      bids: [{ price: "0.0004", baseAmount: "100000000" }],
      asks: [],
    },
  ],
};
