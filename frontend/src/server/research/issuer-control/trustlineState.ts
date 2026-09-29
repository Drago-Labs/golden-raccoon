import type { IssuerFlagSnapshot, ResolvedAsset, TrustlineSnapshot, TrustlineState } from "./schema";

export type BalanceRow = {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance?: string;
  limit?: string;
  buying_liabilities?: string;
  selling_liabilities?: string;
  is_authorized?: boolean;
  is_authorized_to_maintain_liabilities?: boolean;
};

export function classifyTrustlineState(row: BalanceRow | null | undefined): TrustlineState {
  if (!row) return "missing";
  if (row.is_authorized === true && row.is_authorized_to_maintain_liabilities !== true) {
    return "fully_authorized";
  }
  if (row.is_authorized_to_maintain_liabilities === true) {
    return "authorized_to_maintain_liabilities";
  }
  if (row.is_authorized === false) {
    return "unauthorized";
  }
  // Present but flags missing → do not invent "authorized"
  return "unavailable";
}

export function findClassicBalance(balances: BalanceRow[] | null, code: string, issuer: string): BalanceRow | null {
  if (!balances) return null;
  return (
    balances.find(
      (entry) =>
        entry.asset_type !== "native" &&
        entry.asset_code?.toUpperCase() === code.toUpperCase() &&
        entry.asset_issuer === issuer,
    ) ?? null
  );
}

export function buildTrustlineSnapshot(input: {
  asset: ResolvedAsset;
  account: string;
  balances: BalanceRow[] | null;
  ledger: number | null;
  observedAt: string | null;
  source: string | null;
  balancesUnavailable: boolean;
}): TrustlineSnapshot {
  const base = {
    account: input.account,
    assetKey: input.asset.assetKey,
    ledger: input.ledger,
    observedAt: input.observedAt,
    source: input.source,
    balance: null as string | null,
    limit: null as string | null,
    buyingLiabilities: null as string | null,
    sellingLiabilities: null as string | null,
  };

  if (input.asset.kind === "native") {
    return {
      ...base,
      state: "not_required",
      note: "Native XLM does not use a trustline; authorization flags do not apply.",
    };
  }

  if (input.balancesUnavailable || input.balances === null) {
    return {
      ...base,
      state: "unavailable",
      note: "Account or trustline evidence is unavailable; no authorized/safe claim is made.",
    };
  }

  if (input.asset.kind === "soroban_token" || input.asset.kind === "unsupported") {
    return {
      ...base,
      state: "unavailable",
      note: "Classic trustline authorization does not apply to this Soroban token identity in this inspector.",
    };
  }

  if (!input.asset.code || !input.asset.issuer) {
    return {
      ...base,
      state: "unavailable",
      note: "Classic asset code/issuer missing; trustline state cannot be observed.",
    };
  }

  const row = findClassicBalance(input.balances, input.asset.code, input.asset.issuer);
  if (!row) {
    return {
      ...base,
      state: "missing",
      note: "No matching trustline appears on the account at the observed ledger.",
    };
  }

  const state = classifyTrustlineState(row);
  return {
    ...base,
    state,
    balance: row.balance ?? null,
    limit: row.limit ?? null,
    buyingLiabilities: row.buying_liabilities ?? null,
    sellingLiabilities: row.selling_liabilities ?? null,
    note:
      state === "fully_authorized"
        ? "Trustline is fully authorized at the observed ledger."
        : state === "authorized_to_maintain_liabilities"
          ? "Trustline may maintain liabilities but is not fully authorized to hold or receive."
          : state === "unauthorized"
            ? "Trustline exists but is unauthorized."
            : "Trustline row present but authorization flags were incomplete.",
  };
}

export function buildIssuerFlagSnapshot(input: {
  asset: ResolvedAsset;
  flags: {
    authRequired: boolean;
    authRevocable: boolean;
    authImmutable: boolean;
    authClawbackEnabled: boolean;
    issuerExists: boolean;
  } | null;
  flagsUnavailable: boolean;
  ledger: number | null;
  observedAt: string | null;
  source: string | null;
}): IssuerFlagSnapshot {
  if (input.asset.kind === "native") {
    return {
      state: "not_applicable",
      authRequired: null,
      authRevocable: null,
      authImmutable: null,
      authClawbackEnabled: null,
      issuerExists: null,
      issuer: null,
      ledger: input.ledger,
      observedAt: input.observedAt,
      source: input.source,
      note: "Native XLM has no issuer control flags.",
    };
  }

  if (input.asset.kind !== "classic" || !input.asset.issuer) {
    return {
      state: "unavailable",
      authRequired: null,
      authRevocable: null,
      authImmutable: null,
      authClawbackEnabled: null,
      issuerExists: null,
      issuer: input.asset.issuer,
      ledger: input.ledger,
      observedAt: input.observedAt,
      source: input.source,
      note: "Issuer account flags are only observed for classic CODE:ISSUER assets.",
    };
  }

  if (input.flagsUnavailable || !input.flags) {
    return {
      state: "unavailable",
      authRequired: null,
      authRevocable: null,
      authImmutable: null,
      authClawbackEnabled: null,
      issuerExists: null,
      issuer: input.asset.issuer,
      ledger: input.ledger,
      observedAt: input.observedAt,
      source: input.source,
      note: "Issuer flag evidence is unavailable; no safe authorization claim is made.",
    };
  }

  if (!input.flags.issuerExists) {
    return {
      state: "unavailable",
      authRequired: null,
      authRevocable: null,
      authImmutable: null,
      authClawbackEnabled: null,
      issuerExists: false,
      issuer: input.asset.issuer,
      ledger: input.ledger,
      observedAt: input.observedAt,
      source: input.source,
      note: "Issuer account was not found on this network.",
    };
  }

  return {
    state: "observed",
    authRequired: input.flags.authRequired,
    authRevocable: input.flags.authRevocable,
    authImmutable: input.flags.authImmutable,
    authClawbackEnabled: input.flags.authClawbackEnabled,
    issuerExists: true,
    issuer: input.asset.issuer,
    ledger: input.ledger,
    observedAt: input.observedAt,
    source: input.source,
    note: "Issuer control flags recorded at the observed ledger.",
  };
}
