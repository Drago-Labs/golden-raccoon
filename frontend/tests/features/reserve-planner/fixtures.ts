import type { StellarAccountDataAdapter } from "@/server/stellar/horizonAdapter";
import type { LedgerParameterReader } from "@/server/research/reserve-planner/ledgerParameters";

if (typeof window !== "undefined" && !window.localStorage) {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", { value: { get length() { return values.size; }, clear: () => values.clear(), getItem: (key: string) => values.get(key) ?? null, key: (index: number) => [...values.keys()][index] ?? null, removeItem: (key: string) => values.delete(key), setItem: (key: string, value: string) => values.set(key, value) } });
}

export const stellarWallet = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const otherWallet = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

export function accountAdapter(input: { wallet?: string; balance?: string; selling?: string; subentries?: number; sponsoring?: number; sponsored?: number; assetTypes?: string[] } = {}): StellarAccountDataAdapter {
  return { loadAccount: async () => ({
    value: {
      account_id: input.wallet ?? stellarWallet,
      id: input.wallet ?? stellarWallet,
      last_modified_ledger: 900,
      subentry_count: input.subentries ?? 2,
      num_sponsoring: input.sponsoring ?? 0,
      num_sponsored: input.sponsored ?? 0,
      balances: [
        { asset_type: "native", balance: input.balance ?? "100.0000000", selling_liabilities: input.selling ?? "1.2500000" },
        ...(input.assetTypes ?? []).map((asset_type) => ({ asset_type, balance: "0.0000000" })),
      ],
    },
    meta: { providerUrl: "https://horizon.example", checkedAt: "2026-01-01T00:00:00Z" },
  }) } as unknown as StellarAccountDataAdapter;
}

export const ledgerReader: LedgerParameterReader = async (ledger) => ({ ledger, baseReserveStroops: 5_000_000n, source: "https://horizon.example" });
