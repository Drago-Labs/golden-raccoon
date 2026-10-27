import type { SupplySnapshot } from "./schema";
import { CIRCULATING_SUPPLY_LIMITS } from "./limits";
export async function readStellarSupply(horizonUrl: string, assetCode: string, issuer: string, holders: string[]): Promise<SupplySnapshot> {
  const base = horizonUrl.replace(/\/$/, "");
  const assetResponse = await fetch(`${base}/assets?asset_code=${encodeURIComponent(assetCode)}&asset_issuer=${issuer}&limit=1`, { signal: AbortSignal.timeout(CIRCULATING_SUPPLY_LIMITS.timeoutMs), cache: "no-store" });
  if (!assetResponse.ok) throw new Error("Stellar provider unavailable");
  const asset = (await assetResponse.json()) as { _embedded?: { records?: Array<{ amount: string }> } };
  const balances: Record<string, string> = {};
  for (const holder of holders) { const response = await fetch(`${base}/accounts/${holder}`, { signal: AbortSignal.timeout(CIRCULATING_SUPPLY_LIMITS.timeoutMs), cache: "no-store" }); const account = (await response.json()) as { balances?: Array<{ asset_code?: string; asset_issuer?: string; balance: string }>; sequence?: string }; const row = account.balances?.find((b) => b.asset_code === assetCode && b.asset_issuer === issuer); balances[holder.toUpperCase()] = decimalToUnits(row?.balance ?? "0", 7); }
  const root = await fetch(base, { signal: AbortSignal.timeout(CIRCULATING_SUPPLY_LIMITS.timeoutMs), cache: "no-store" }).then((r) => r.json()) as { history_latest_ledger?: number };
  return { totalSupply: decimalToUnits(asset._embedded?.records?.[0]?.amount ?? "0", 7), balances, observation: root.history_latest_ledger ?? 0, sourceUrl: base };
}
export function decimalToUnits(value: string, decimals: number): string { const [whole, fraction = ""] = value.split("."); return `${whole}${fraction.padEnd(decimals, "0").slice(0, decimals)}`.replace(/^0+(?=\d)/, ""); }
