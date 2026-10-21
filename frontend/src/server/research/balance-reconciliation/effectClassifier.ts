import { assetKey, type AssetFields } from "./assetIdentity";
import type { BalanceCategory } from "./schema";
import { decimalToStroops } from "./runningBalance";

export type RawEffect = {
  id: string;
  pagingToken: string;
  type: string;
  ledger: number;
  account: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  asset?: string;
  seller?: string;
  sold_amount?: string;
  sold_asset_type?: string;
  sold_asset_code?: string;
  sold_asset_issuer?: string;
  bought_amount?: string;
  bought_asset_type?: string;
  bought_asset_code?: string;
  bought_asset_issuer?: string;
  reserves_deposited?: AssetFields[];
  reserves_received?: AssetFields[];
};

export type ClassifiedMovement = {
  id: string;
  ledger: number;
  category: BalanceCategory;
  asset: string;
  stroops: bigint;
};

export type Classification = {
  movements: ClassifiedMovement[];
  unclassified: Array<{ id: string; type: string }>;
};

function signed(amount: string, direction: 1 | -1): bigint {
  const value = decimalToStroops(amount);
  return value < 0n ? value : value * BigInt(direction);
}

function single(effect: RawEffect, category: BalanceCategory, direction: 1 | -1): ClassifiedMovement[] {
  if (!effect.amount) return [];
  return [{
    id: effect.id,
    ledger: effect.ledger,
    category,
    asset: assetKey(effect),
    stroops: signed(effect.amount, direction),
  }];
}

function tradeSide(effect: RawEffect, category: BalanceCategory): ClassifiedMovement[] {
  const sold = effect.sold_amount;
  const bought = effect.bought_amount;
  if (!sold || !bought) return [];
  const accountIsSeller = !effect.seller || effect.seller === effect.account;
  const soldDirection: 1 | -1 = accountIsSeller ? -1 : 1;
  const boughtDirection: 1 | -1 = accountIsSeller ? 1 : -1;
  return [
    {
      id: effect.id,
      ledger: effect.ledger,
      category,
      asset: assetKey({ asset_type: effect.sold_asset_type, asset_code: effect.sold_asset_code, asset_issuer: effect.sold_asset_issuer }),
      stroops: signed(sold, soldDirection),
    },
    {
      id: effect.id,
      ledger: effect.ledger,
      category,
      asset: assetKey({ asset_type: effect.bought_asset_type, asset_code: effect.bought_asset_code, asset_issuer: effect.bought_asset_issuer }),
      stroops: signed(bought, boughtDirection),
    },
  ];
}

function reserves(effect: RawEffect, rows: AssetFields[] | undefined, direction: 1 | -1): ClassifiedMovement[] {
  return (rows ?? []).flatMap((reserve, index) => {
    const amount = typeof reserve.amount === "string" ? reserve.amount : undefined;
    if (!amount) return [];
    return [{
      id: `${effect.id}:${index}`,
      ledger: effect.ledger,
      category: "pool" as const,
      asset: assetKey(reserve),
      stroops: signed(amount, direction),
    }];
  });
}

export function classifyEffect(effect: RawEffect): Classification {
  try {
    return classifyKnownEffect(effect);
  } catch {
    return { movements: [], unclassified: [{ id: effect.id, type: effect.type }] };
  }
}

function classifyKnownEffect(effect: RawEffect): Classification {
  const type = effect.type;
  if (type === "account_credited") return { movements: single(effect, "credit", 1), unclassified: [] };
  if (type === "account_debited") return { movements: single(effect, "debit", -1), unclassified: [] };
  if (type === "trade") return { movements: tradeSide(effect, "trade"), unclassified: [] };
  if (type === "liquidity_pool_trade") return { movements: tradeSide(effect, "pool"), unclassified: [] };
  if (type === "liquidity_pool_deposited") return { movements: reserves(effect, effect.reserves_deposited, -1), unclassified: [] };
  if (type === "liquidity_pool_withdrew") return { movements: reserves(effect, effect.reserves_received, 1), unclassified: [] };
  if (type === "claimable_balance_created") return { movements: single(effect, "claimable", -1), unclassified: [] };
  if (type === "claimable_balance_claimed") return { movements: single(effect, "claimable", 1), unclassified: [] };
  if (type.includes("clawback") || type.includes("clawed_back")) return { movements: single(effect, "clawback", -1), unclassified: [] };
  return { movements: [], unclassified: [{ id: effect.id, type }] };
}

export function classifyEffects(effects: RawEffect[]): Classification {
  const movements: ClassifiedMovement[] = [];
  const unclassified: Array<{ id: string; type: string }> = [];
  for (const effect of effects) {
    const result = classifyEffect(effect);
    movements.push(...result.movements);
    unclassified.push(...result.unclassified);
  }
  return { movements, unclassified };
}
