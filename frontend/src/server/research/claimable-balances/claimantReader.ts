import { getStellarDataApiUrls, getStellarNetwork, type StellarNetworkId } from "@/lib/stellar/config";
import { redactProviderUrl } from "@/lib/stellar/failover";

export type RawClaimable = { id: string; asset: string; amount: string; sponsor?: string; last_modified_ledger: number; paging_token?: string; claimants: { destination: string; predicate: unknown }[] };
export type ClaimableEvidence = { records: RawClaimable[]; accountBalances: import("./assetEligibility").AccountBalanceEvidence[] | null; ledger: number; closeTime: string; source: string; pagesRead: number; duplicatePage: boolean; truncated: boolean; missingIds: string[] };
export interface ClaimantSource { read(input: { wallet: string; network: StellarNetworkId; pageSize: number; maxPages: number; knownIds: string[] }): Promise<ClaimableEvidence>; }

async function getJson<T>(base: string, path: string): Promise<T> {
  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Horizon HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export class HorizonClaimantSource implements ClaimantSource {
  async read(input: { wallet: string; network: StellarNetworkId; pageSize: number; maxPages: number; knownIds: string[] }): Promise<ClaimableEvidence> {
    const network = getStellarNetwork(input.network); if (!network) throw new Error("Unsupported Stellar network");
    let lastError: Error | null = null;
    for (const base of getStellarDataApiUrls(network)) {
      try {
        const latest = await getJson<{ _embedded: { records: { sequence: number; closed_at: string }[] } }>(base, "/ledgers?order=desc&limit=1");
        const observed = latest._embedded.records[0]; if (!observed) throw new Error("Latest ledger unavailable");
        const account = await getJson<{ balances: import("./assetEligibility").AccountBalanceEvidence[] }>(base, `/accounts/${encodeURIComponent(input.wallet)}`).catch(() => null);
        const records: RawClaimable[] = []; const seenCursors = new Set<string>(); const seenIds = new Set<string>(); let cursor = ""; let duplicatePage = false; let pagesRead = 0; let exhausted = false;
        for (let pageIndex = 0; pageIndex < input.maxPages; pageIndex += 1) {
          pagesRead += 1;
          const page = await getJson<{ _embedded: { records: RawClaimable[] } }>(base, `/claimable_balances?claimant=${encodeURIComponent(input.wallet)}&order=asc&limit=${input.pageSize}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
          const pageRecords = page._embedded.records; if (!pageRecords.length) { exhausted = true; break; }
          for (const record of pageRecords) if (!seenIds.has(record.id)) { seenIds.add(record.id); records.push(record); }
          const next = pageRecords.at(-1)?.paging_token; if (!next || seenCursors.has(next)) { duplicatePage = Boolean(next); exhausted = !next; break; } seenCursors.add(next); cursor = next;
          if (pageRecords.length < input.pageSize) { exhausted = true; break; }
        }
        const missingIds: string[] = [];
        for (const id of input.knownIds) {
          if (seenIds.has(id)) continue;
          const known = await getJson<RawClaimable>(base, `/claimable_balances/${encodeURIComponent(id)}`).catch(() => null);
          if (known) { seenIds.add(known.id); records.push(known); } else missingIds.push(id);
        }
        return { records, accountBalances: account?.balances ?? null, ledger: Number(observed.sequence), closeTime: observed.closed_at, source: redactProviderUrl(base), pagesRead, duplicatePage, truncated: !exhausted && pagesRead >= input.maxPages, missingIds };
      } catch (error) { lastError = error instanceof Error ? error : new Error("Horizon read failed"); }
    }
    throw lastError ?? new Error("Claimable balance providers unavailable");
  }
}
