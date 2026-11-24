export type RawPosition = {
  tokenId: string;
  operator: string;
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  feeGrowthInside0LastX128: string;
  feeGrowthInside1LastX128: string;
  tokensOwed0: string;
  tokensOwed1: string;
  pool: string;
};

export type PositionReadResult =
  | { status: "available"; positions: RawPosition[]; nextCursor: string | null }
  | { status: "unavailable"; reason: string };

export type PositionReader = (input: {
  address: string;
  network: string;
  npmAddress: string;
  pageSize: number;
  cursor?: string;
}) => Promise<PositionReadResult>;

/** Default reader returns unavailable — production wires an RPC/subgraph adapter via deps. */
export const defaultPositionReader: PositionReader = async () => ({
  status: "unavailable",
  reason: "Position NFT provider is not configured in this environment.",
});

export function isClosedPosition(position: RawPosition): boolean {
  return BigInt(position.liquidity) === 0n;
}
