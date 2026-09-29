import type { ControlEvent, ControlEventKind } from "./schema";

const KNOWN: Record<string, ControlEventKind> = {
  trustline_created: "trustline_created",
  trustline_removed: "trustline_removed",
  trustline_updated: "trustline_updated",
  trustline_authorized: "trustline_authorized",
  trustline_deauthorized: "trustline_deauthorized",
  trustline_clawed_back: "trustline_clawed_back",
  account_flags_updated: "account_flags_updated",
};

export type RawEffect = {
  id: string;
  paging_token?: string;
  type?: string;
  type_i?: number;
  account?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  amount?: string;
  ledger?: number;
  ledger_attr?: number;
  created_at?: string;
  closed_at?: string;
};

export function effectKind(type: string | undefined): ControlEventKind {
  if (!type) return "unknown";
  return KNOWN[type] ?? "unknown";
}

export function effectAssetKey(effect: RawEffect): string | null {
  if (effect.asset_type === "native") return "native";
  if (effect.asset_code && effect.asset_issuer) {
    return `classic:${effect.asset_code.toUpperCase()}:${effect.asset_issuer}`;
  }
  return null;
}

export function matchesAsset(effect: RawEffect, assetKey: string, code: string | null, issuer: string | null): boolean {
  if (assetKey === "native") return effect.asset_type === "native" || effect.type === "account_flags_updated";
  if (effect.type === "account_flags_updated") {
    return Boolean(issuer && effect.account === issuer);
  }
  if (!code || !issuer) return false;
  return (
    effect.asset_code?.toUpperCase() === code.toUpperCase() &&
    effect.asset_issuer === issuer
  );
}

export function mapEffect(effect: RawEffect, source: string): ControlEvent {
  const kind = effectKind(effect.type);
  return {
    id: effect.id,
    kind,
    pagingToken: effect.paging_token ?? effect.id,
    account: effect.account ?? null,
    assetKey: effectAssetKey(effect),
    amount: effect.amount ?? null,
    ledger: effect.ledger ?? effect.ledger_attr ?? null,
    closedAt: effect.created_at ?? effect.closed_at ?? null,
    source,
    note:
      kind === "unknown"
        ? `Unrecognized effect type ${effect.type ?? "missing"}; retained without reinterpretation.`
        : `Observed ${kind.replaceAll("_", " ")} effect.`,
  };
}
