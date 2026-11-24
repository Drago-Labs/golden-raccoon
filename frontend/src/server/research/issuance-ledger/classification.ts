import { matchesAsset, type AssetIdentity } from "./assetIdentity";
import { decimalToStroops } from "./decimalMath";
import type { IssuanceKind } from "./schema";

/**
 * Raw issuer-touching operation as Horizon records it.
 * Classification rules (documented in docs/features/issuance-ledger.md):
 *
 * - payment / path_payment_*: asset leave issuer → mint; asset return to issuer → burn.
 * - create_claimable_balance by issuer for this asset → mint (outstanding rises).
 * - clawback / clawback_claimable_balance for this asset → burn (outstanding falls).
 * - any other issuer op for this asset, or wrong asset → neutral (zero supply delta).
 */
export type RawIssuerOperation = {
  id: string;
  pagingToken?: string;
  type: string;
  ledger: number;
  source_account?: string;
  from?: string;
  to?: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  transaction_hash?: string;
  created_at?: string;
  /** Path payment destination amount when `amount` is the send side. */
  destination_amount?: string;
};

export type ClassifiedOperation = {
  id: string;
  ledger: number;
  type: string;
  kind: IssuanceKind;
  /** Signed supply delta in stroops: mint positive, burn negative, neutral zero. */
  deltaStroops: bigint;
  from: string | null;
  to: string | null;
  transactionHash: string | null;
  createdAt: string | null;
};

const PAYMENT_TYPES = new Set(["payment", "path_payment_strict_send", "path_payment_strict_receive"]);

function amountOf(op: RawIssuerOperation): string | undefined {
  if (typeof op.amount === "string" && op.amount.length > 0) return op.amount;
  if (typeof op.destination_amount === "string" && op.destination_amount.length > 0) return op.destination_amount;
  return undefined;
}

function parties(op: RawIssuerOperation): { from: string | null; to: string | null } {
  return {
    from: op.from ?? op.source_account ?? null,
    to: op.to ?? null,
  };
}

/**
 * Classify one issuer operation for a single issued asset.
 * Unknown types that still mention the asset are neutral; types with no amount stay neutral.
 */
export function classifyOperation(op: RawIssuerOperation, asset: AssetIdentity): ClassifiedOperation {
  const { from, to } = parties(op);
  const base = {
    id: op.id,
    ledger: op.ledger,
    type: op.type,
    from,
    to,
    transactionHash: op.transaction_hash ?? null,
    createdAt: op.created_at ?? null,
  };

  const touchesAsset = matchesAsset(op, asset);
  const amountText = amountOf(op);

  if (PAYMENT_TYPES.has(op.type) && touchesAsset && amountText) {
    const amount = decimalToStroops(amountText);
    if (from === asset.issuer && to !== asset.issuer) {
      return { ...base, kind: "mint", deltaStroops: amount };
    }
    if (to === asset.issuer && from !== asset.issuer) {
      return { ...base, kind: "burn", deltaStroops: -amount };
    }
    return { ...base, kind: "neutral", deltaStroops: 0n };
  }

  if (op.type === "create_claimable_balance" && touchesAsset && amountText) {
    const amount = decimalToStroops(amountText);
    if ((op.source_account ?? from) === asset.issuer) {
      return { ...base, kind: "mint", deltaStroops: amount };
    }
    return { ...base, kind: "neutral", deltaStroops: 0n };
  }

  if ((op.type === "clawback" || op.type === "clawback_claimable_balance") && touchesAsset && amountText) {
    const amount = decimalToStroops(amountText);
    return { ...base, kind: "burn", deltaStroops: -amount };
  }

  return { ...base, kind: "neutral", deltaStroops: 0n };
}

export function classifyOperations(ops: RawIssuerOperation[], asset: AssetIdentity): ClassifiedOperation[] {
  return ops.map((op) => classifyOperation(op, asset));
}
