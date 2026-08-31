export type CostBasisEventKind = "buy" | "sell" | "swap" | "transfer" | "fee";

export type CostBasisEvent = {
  id: string;
  timestamp: string;
  kind: CostBasisEventKind;
  asset: string;
  quantityBaseUnits: string;
  /** USD price per base unit, represented as a decimal string. */
  unitPriceUsd?: string;
  /** For swaps, the asset received or sold alongside `asset`. */
  counterAsset?: string;
  counterQuantityBaseUnits?: string;
  counterUnitPriceUsd?: string;
  feeAsset?: string;
  feeQuantityBaseUnits?: string;
  source?: string;
};

export type CostBasisLot = {
  id: string;
  asset: string;
  acquiredAt: string;
  quantityBaseUnits: string;
  costBasisUsd: string;
  source?: string;
  unknownBasis: boolean;
};

export type RealizedPnl = {
  asset: string;
  proceedsUsd: string;
  costBasisUsd: string;
  pnlUsd: string;
  quantityBaseUnits: string;
  unknownBasis: boolean;
};

export type CostBasisResult = {
  lots: CostBasisLot[];
  realized: RealizedPnl[];
  unrealized: Array<{ asset: string; quantityBaseUnits: string; costBasisUsd: string; marketValueUsd?: string; pnlUsd?: string; unknownBasis: boolean }>;
  missingPriceEventIds: string[];
  unknownBasisAssets: string[];
  status: "complete" | "partial" | "incomplete";
  reconciliation: Array<{ asset: string; expectedBaseUnits: string; calculatedBaseUnits: string; deltaBaseUnits: string; ok: boolean }>;
};
