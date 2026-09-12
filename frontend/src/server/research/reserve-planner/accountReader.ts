import { HorizonAccountDataAdapter, type StellarAccountDataAdapter } from "@/server/stellar/horizonAdapter";
import type { StellarNetworkId } from "@/lib/stellar/config";
import { decimalToStroops } from "./amounts";

export type ReserveAccount = {
  accountId: string;
  lastModifiedLedger: number;
  balanceStroops: bigint;
  sellingLiabilitiesStroops: bigint;
  counters: { subentryCount: number; numSponsoring: number; numSponsored: number };
  unsupportedEntryTypes: string[];
  source: string;
  checkedAt: string;
};

export async function readReserveAccount(
  walletAddress: string,
  network: StellarNetworkId,
  adapter: StellarAccountDataAdapter = new HorizonAccountDataAdapter(),
): Promise<ReserveAccount> {
  const result = await adapter.loadAccount(walletAddress, network);
  const account = result.value;
  const native = account.balances.find((balance) => balance.asset_type === "native");
  if (!native) throw new Error("Native XLM balance unavailable");
  const accountId = String(account.account_id ?? account.id ?? "");
  const lastModifiedLedger = Number(account.last_modified_ledger);
  const counters = {
    subentryCount: Number(account.subentry_count),
    numSponsoring: Number(account.num_sponsoring ?? 0),
    numSponsored: Number(account.num_sponsored ?? 0),
  };
  if (!Number.isSafeInteger(lastModifiedLedger) || lastModifiedLedger <= 0) throw new Error("Account observation ledger unavailable");
  if (Object.values(counters).some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error("Inconsistent sponsorship counters");
  return {
    accountId,
    lastModifiedLedger,
    balanceStroops: decimalToStroops(native.balance),
    sellingLiabilitiesStroops: decimalToStroops(native.selling_liabilities ?? "0"),
    counters,
    unsupportedEntryTypes: [...new Set(account.balances.map((balance) => balance.asset_type).filter((type) => !["native", "credit_alphanum4", "credit_alphanum12", "liquidity_pool_shares"].includes(type)))],
    source: result.meta.providerUrl,
    checkedAt: result.meta.checkedAt,
  };
}
