/**
 * Bounded paging of account trustlines that hold one issued asset.
 *
 * `pageHolderTrustlines` is the pure walker: it stops at the page cap, the
 * holder cap, a missing cursor, or a cursor it has already seen. The Horizon
 * adapter below is the production reader. Tests inject their own page source
 * and do not call it.
 */
import { getStellarDataApiUrls, getStellarNetwork } from "@/lib/stellar/config";
import { HolderDistributionError } from "./errors";
import { distributionAccountsFromToml, stellarTomlUrl } from "./issuerAdjacency";
import { readPublicHttpsText } from "@/server/security/publicHttpsText";
import { HOLDER_LIMITS } from "./limits";
import { resolveNetworkIdentity } from "./networkIdentity";
import type { CanonicalAsset, HolderDistributionReader, SupplySnapshot, TrustlinePage, TrustlineRecord } from "./schema";

export type TrustlinePageSource = (cursor: string | null, limit: number) => Promise<TrustlinePage>;

export type PagedTrustlines = {
  holders: TrustlineRecord[];
  pagesRead: number;
  truncated: boolean;
  duplicateCursor: boolean;
  duplicateAccount: boolean;
};

export async function pageHolderTrustlines(source: TrustlinePageSource, options: {
  pageSize: number;
  maxPages: number;
  maxHolders: number;
}): Promise<PagedTrustlines> {
  const pageSize = clamp(options.pageSize, 1, HOLDER_LIMITS.maxPageSize);
  const maxPages = clamp(options.maxPages, 1, HOLDER_LIMITS.maxPages);
  const maxHolders = clamp(options.maxHolders, 1, HOLDER_LIMITS.maxHolders);
  const holders: TrustlineRecord[] = [];
  const seenAccounts = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let pagesRead = 0;
  let truncated = false;
  let duplicateCursor = false;
  let duplicateAccount = false;

  while (pagesRead < maxPages && holders.length < maxHolders) {
    const page = await source(cursor, pageSize);

    pagesRead += 1;

    for (const record of page.records) {
      if (holders.length >= maxHolders) {
        truncated = true;
        break;
      }

      const accountId = record.accountId.trim();

      if (accountId.length === 0) continue;

      if (seenAccounts.has(accountId)) {
        duplicateAccount = true;
        truncated = true;
        continue;
      }

      seenAccounts.add(accountId);
      holders.push({ accountId, balance: record.balance });
    }

    if (!page.nextCursor) break;

    if (seenCursors.has(page.nextCursor)) {
      duplicateCursor = true;
      truncated = true;
      break;
    }

    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;

    if (pagesRead >= maxPages || holders.length >= maxHolders) {
      truncated = true;
      break;
    }
  }

  return { holders, pagesRead, truncated, duplicateCursor, duplicateAccount };
}

export function createHorizonHolderReader(): HolderDistributionReader {
  return {
    readSupply: (asset) => readSupply(asset),
    readTrustlinePage: (asset, cursor, limit) => readTrustlinePage(asset, cursor, limit),
    readLiquidityPools: (asset) => readAmountPages(asset, "liquidity_pools", poolAmount),
    readClaimableBalances: (asset) => readAmountPages(asset, "claimable_balances", claimableAmount),
    readDistributionAccounts: (asset) => readDistributionAccounts(asset),
  };
}

async function readSupply(asset: CanonicalAsset): Promise<SupplySnapshot> {
  return withHorizon(asset, async (base) => {
    const ledgerPayload = await getJson<{ _embedded?: { records?: { sequence?: number; closed_at?: string }[] } }>(
      `${base}/ledgers?order=desc&limit=1`,
    );
    const ledgerRecord = ledgerPayload._embedded?.records?.[0];

    if (!ledgerRecord || typeof ledgerRecord.sequence !== "number") {
      throw new HolderDistributionError("provider_unavailable", "Horizon did not return a ledger sequence.");
    }

    const query = `asset_code=${encodeURIComponent(asset.code)}&asset_issuer=${encodeURIComponent(asset.issuer)}`;
    const assets = await getJson<{ _embedded?: { records?: HorizonAsset[] } }>(`${base}/assets?${query}`);
    const record = assets._embedded?.records?.find((candidate) => candidate.asset_code === asset.code && candidate.asset_issuer === asset.issuer);

    if (!record || typeof record.amount !== "string") {
      throw new HolderDistributionError("provider_unavailable", "Horizon has no asset record for this code and issuer on this network.");
    }

    return {
      ledger: ledgerRecord.sequence,
      ledgerClosedAt: typeof ledgerRecord.closed_at === "string" ? ledgerRecord.closed_at : null,
      issued: record.amount,
      authorized: record.balances?.authorized ?? "0.0000000",
      authorizedToMaintainLiabilities: record.balances?.authorized_to_maintain_liabilities ?? "0.0000000",
      unauthorized: record.balances?.unauthorized ?? "0.0000000",
      liquidityPools: record.liquidity_pools_amount ?? "0.0000000",
      claimableBalances: record.claimable_balances_amount ?? "0.0000000",
      contracts: record.contracts_amount ?? "0.0000000",
      numAccounts: typeof record.num_accounts === "number" ? record.num_accounts : null,
    };
  });
}

async function readTrustlinePage(asset: CanonicalAsset, cursor: string | null, limit: number): Promise<TrustlinePage> {
  const pageSize = clamp(limit, 1, HOLDER_LIMITS.maxPageSize);

  return withHorizon(asset, async (base) => {
    const params = new URLSearchParams({
      asset: asset.canonical,
      limit: String(pageSize),
      order: "desc",
    });

    if (cursor) params.set("cursor", cursor);

    const payload = await getJson<HorizonPage<HorizonAccount>>(`${base}/accounts?${params.toString()}`);
    const records: TrustlineRecord[] = [];

    for (const account of payload._embedded?.records ?? []) {
      if (typeof account.account_id !== "string") continue;

      const balance = matchingBalance(account.balances, asset);

      if (balance === null) continue;

      records.push({ accountId: account.account_id, balance });
    }

    return {
      records,
      nextCursor: cursorFromLink(payload._links?.next?.href, cursor),
    };
  });
}

async function readAmountPages(
  asset: CanonicalAsset,
  collection: "liquidity_pools" | "claimable_balances",
  amountOf: (record: HorizonPool | HorizonClaimable, asset: CanonicalAsset) => string | null,
): Promise<{ records: { id: string; amount: string }[]; truncated: boolean }> {
  const records: { id: string; amount: string }[] = [];
  const cap = collection === "liquidity_pools" ? HOLDER_LIMITS.maxPools : HOLDER_LIMITS.maxClaimables;
  let cursor: string | null = null;
  let truncated = false;
  const seen = new Set<string>();

  for (let page = 0; page < HOLDER_LIMITS.maxPages && records.length < cap; page += 1) {
    const payload = await withHorizon(asset, async (base) => {
      const params = new URLSearchParams({
        limit: String(HOLDER_LIMITS.maxPageSize),
        order: "desc",
      });

      if (collection === "liquidity_pools") params.set("reserves", asset.canonical);
      else params.set("asset", asset.canonical);

      if (cursor) params.set("cursor", cursor);

      return getJson<HorizonPage<HorizonPool & HorizonClaimable>>(`${base}/${collection}?${params.toString()}`);
    });

    for (const record of payload._embedded?.records ?? []) {
      if (records.length >= cap) {
        truncated = true;
        break;
      }

      const id = record.id;
      const amount = amountOf(record, asset);

      if (typeof id !== "string" || amount === null) continue;

      records.push({ id, amount });
    }

    const next = cursorFromLink(payload._links?.next?.href, cursor);

    if (!next || seen.has(next)) {
      if (next && seen.has(next)) truncated = true;
      break;
    }

    seen.add(next);
    cursor = next;

    if (page + 1 >= HOLDER_LIMITS.maxPages) {
      truncated = true;
      break;
    }
  }

  return { records, truncated };
}

async function readDistributionAccounts(asset: CanonicalAsset): Promise<{ accounts: string[]; tomlRead: boolean }> {
  try {
    const account = await withHorizon(asset, (base) => getJson<HorizonAccount>(`${base}/accounts/${encodeURIComponent(asset.issuer)}`));
    const homeDomain = typeof account.home_domain === "string" ? account.home_domain : "";
    const url = stellarTomlUrl(homeDomain);

    if (!url) return { accounts: [], tomlRead: false };

    const toml = await readPublicHttpsText(url, HOLDER_LIMITS.maxTomlBytes, HOLDER_LIMITS.timeoutMs);

    return { accounts: distributionAccountsFromToml(toml, asset.code, asset.issuer), tomlRead: true };
  } catch {
    return { accounts: [], tomlRead: false };
  }
}

async function withHorizon<T>(asset: CanonicalAsset, read: (base: string) => Promise<T>): Promise<T> {
  const identity = resolveNetworkIdentity(asset.network);
  const config = getStellarNetwork(asset.network);
  const bases = identity?.horizonUrls ?? (config ? getStellarDataApiUrls(config) : []);

  if (bases.length === 0) {
    throw new HolderDistributionError("unsupported_network", "No Horizon host is configured for this network.");
  }

  let lastError: Error | null = null;

  for (const base of bases) {
    try {
      return await read(base.replace(/\/$/, ""));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Horizon read failed.");
    }
  }

  if (lastError instanceof HolderDistributionError) throw lastError;

  throw new HolderDistributionError("provider_unavailable", lastError?.message ?? "Horizon could not be reached.");
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(HOLDER_LIMITS.timeoutMs) });

  if (!response.ok) {
    throw new HolderDistributionError("provider_unavailable", `Horizon responded with HTTP ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

function matchingBalance(balances: HorizonBalance[] | undefined, asset: CanonicalAsset): string | null {
  for (const balance of balances ?? []) {
    if (balance.asset_code === asset.code && balance.asset_issuer === asset.issuer && typeof balance.balance === "string") {
      return balance.balance;
    }
  }

  return null;
}

function poolAmount(record: HorizonPool, asset: CanonicalAsset): string | null {
  const reserve = record.reserves?.find((entry) => entry.asset === asset.canonical);

  return typeof reserve?.amount === "string" ? reserve.amount : null;
}

function claimableAmount(record: HorizonClaimable, asset: CanonicalAsset): string | null {
  if (record.asset !== asset.canonical || typeof record.amount !== "string") return null;

  return record.amount;
}

function cursorFromLink(href: string | undefined, current: string | null): string | null {
  if (!href) return null;

  try {
    const cursor = new URL(href).searchParams.get("cursor");

    if (!cursor || cursor === current) return null;

    return cursor;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;

  return Math.min(max, Math.max(min, Math.trunc(value)));
}

type HorizonBalance = {
  balance?: string;
  asset_code?: string;
  asset_issuer?: string;
};

type HorizonAccount = {
  account_id?: string;
  home_domain?: string;
  balances?: HorizonBalance[];
};

type HorizonAsset = {
  asset_code?: string;
  asset_issuer?: string;
  amount?: string;
  num_accounts?: number;
  balances?: {
    authorized?: string;
    authorized_to_maintain_liabilities?: string;
    unauthorized?: string;
  };
  liquidity_pools_amount?: string;
  claimable_balances_amount?: string;
  contracts_amount?: string;
};

type HorizonPool = {
  id?: string;
  reserves?: { asset?: string; amount?: string }[];
};

type HorizonClaimable = {
  id?: string;
  amount?: string;
  asset?: string;
};

type HorizonPage<T> = {
  _embedded?: { records?: T[] };
  _links?: { next?: { href?: string } };
};
