export type AccountBalanceEvidence = { asset_type: string; asset_code?: string; asset_issuer?: string; is_authorized?: boolean; is_authorized_to_maintain_liabilities?: boolean };

export function trustlineEligibility(asset: string, balances: AccountBalanceEvidence[] | null): "authorized" | "missing" | "unknown" | "not_required" {
  if (asset === "native") return "not_required";
  if (!balances) return "unknown";
  const split = asset.lastIndexOf(":");
  if (split <= 0) return "unknown";
  const code = asset.slice(0, split); const issuer = asset.slice(split + 1);
  const balance = balances.find((entry) => entry.asset_code === code && entry.asset_issuer === issuer);
  if (!balance) return "missing";
  return balance.is_authorized === false || balance.is_authorized_to_maintain_liabilities === true ? "missing" : "authorized";
}
