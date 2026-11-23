import type { PoolReturnsReport, PositionSnapshot, PricePoint, ReserveSnapshot } from "@/server/research/pool-share-returns/schema";

export const mockReserveSnapshots: ReserveSnapshot[] = [
  {
    ledger: 100,
    reserveA: "1000000000",
    reserveB: "1000000000",
    totalShares: "1000000000",
  },
  {
    ledger: 200,
    reserveA: "1050000000",
    reserveB: "1050000000",
    totalShares: "1020000000",
  },
];

export const mockPositionSnapshots: PositionSnapshot[] = [
  {
    ledger: 100,
    shares: "100000000",
    operation: "initial",
  },
];

export const mockPricePoints: PricePoint[] = [
  {
    ledger: 100,
    assetA: "AssetA",
    assetB: "AssetB",
    priceA: "1.0",
    priceB: "1.0",
  },
  {
    ledger: 200,
    assetA: "AssetA",
    assetB: "AssetB",
    priceA: "1.05",
    priceB: "0.95",
  },
];

export const profitablePositionReport: PoolReturnsReport = {
  schemaVersion: 1,
  account: "GABC123",
  poolId: "pool-1",
  network: "stellar-testnet",
  windowStart: 100,
  windowEnd: 200,
  state: "complete",
  breakdown: {
    holdValue: "1000.0",
    poolValue: "1050.0",
    feeIncome: "15.0",
    divergenceLoss: "5.0",
    totalReturn: "50.0",
  },
  position: mockPositionSnapshots,
  reserves: mockReserveSnapshots,
  prices: mockPricePoints,
  coverageGaps: [],
  coverageNotice: "Complete coverage for the selected window.",
  priceSource: "horizon-trades",
  readOnly: true,
};

export const lossPositionReport: PoolReturnsReport = {
  ...profitablePositionReport,
  breakdown: {
    holdValue: "1100.0",
    poolValue: "1050.0",
    feeIncome: "15.0",
    divergenceLoss: "35.0",
    totalReturn: "-50.0",
  },
};
