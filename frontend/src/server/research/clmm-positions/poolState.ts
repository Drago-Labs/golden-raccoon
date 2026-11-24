export type TickFeeSnapshot = {
  feeGrowthOutside0X128: string;
  feeGrowthOutside1X128: string;
};

export type PoolSnapshot = {
  pool: string;
  sqrtPriceX96: string;
  tick: number;
  feeGrowthGlobal0X128: string;
  feeGrowthGlobal1X128: string;
  tickLowerData: TickFeeSnapshot;
  tickUpperData: TickFeeSnapshot;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
};

export type PoolReadResult =
  | { status: "available"; pool: PoolSnapshot }
  | { status: "unavailable"; reason: string };

export type PoolStateReader = (input: {
  network: string;
  pool: string;
  tickLower: number;
  tickUpper: number;
}) => Promise<PoolReadResult>;

/** Default reader returns unavailable — production wires an RPC adapter via deps. */
export const defaultPoolStateReader: PoolStateReader = async () => ({
  status: "unavailable",
  reason: "Pool state provider is not configured in this environment.",
});
