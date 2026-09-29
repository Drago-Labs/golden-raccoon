import { getStellarDataApiUrls, getStellarNetwork, type StellarNetworkId } from "@/lib/stellar/config";
import { redactProviderUrl } from "@/lib/stellar/failover";
import { mapEffect, matchesAsset, type RawEffect } from "./events";
import type { ControlEvent, ResolvedAsset } from "./schema";
import type { BalanceRow } from "./trustlineState";

export type IssuerFlagEvidence = {
  authRequired: boolean;
  authRevocable: boolean;
  authImmutable: boolean;
  authClawbackEnabled: boolean;
  issuerExists: boolean;
};

export type ControlEvidence = {
  ledger: number;
  closeTime: string;
  source: string;
  accountBalances: BalanceRow[] | null;
  accountMissing: boolean;
  issuerFlags: IssuerFlagEvidence | null;
  issuerFlagsUnavailable: boolean;
  events: ControlEvent[];
  pagesRead: number;
  duplicatePage: boolean;
  truncated: boolean;
};

export interface ControlSource {
  read(input: {
    account: string;
    network: StellarNetworkId;
    asset: ResolvedAsset;
    pageSize: number;
    maxPages: number;
  }): Promise<ControlEvidence>;
}

async function getJson<T>(base: string, path: string): Promise<T> {
  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Horizon HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export class HorizonControlSource implements ControlSource {
  async read(input: {
    account: string;
    network: StellarNetworkId;
    asset: ResolvedAsset;
    pageSize: number;
    maxPages: number;
  }): Promise<ControlEvidence> {
    const network = getStellarNetwork(input.network);
    if (!network) throw new Error("Unsupported Stellar network");

    let lastError: Error | null = null;
    for (const base of getStellarDataApiUrls(network)) {
      try {
        const latest = await getJson<{ _embedded: { records: { sequence: number; closed_at: string }[] } }>(
          base,
          "/ledgers?order=desc&limit=1",
        );
        const observed = latest._embedded.records[0];
        if (!observed) throw new Error("Latest ledger unavailable");

        const source = redactProviderUrl(base);
        let accountBalances: BalanceRow[] | null = null;
        let accountMissing = false;
        try {
          const account = await getJson<{ balances: BalanceRow[] }>(
            base,
            `/accounts/${encodeURIComponent(input.account)}`,
          );
          accountBalances = account.balances;
        } catch {
          accountMissing = true;
          accountBalances = null;
        }

        let issuerFlags: IssuerFlagEvidence | null = null;
        let issuerFlagsUnavailable = false;
        if (input.asset.kind === "classic" && input.asset.issuer && input.asset.code) {
          try {
            const issuerAccount = await getJson<{
              flags?: {
                auth_required?: boolean;
                auth_revocable?: boolean;
                auth_immutable?: boolean;
                auth_clawback_enabled?: boolean;
              };
            }>(base, `/accounts/${encodeURIComponent(input.asset.issuer)}`);
            let clawback = Boolean(issuerAccount.flags?.auth_clawback_enabled);
            try {
              const assets = await getJson<{
                _embedded: { records: { flags?: { auth_clawback_enabled?: boolean } }[] };
              }>(
                base,
                `/assets?asset_code=${encodeURIComponent(input.asset.code)}&asset_issuer=${encodeURIComponent(input.asset.issuer)}&limit=1`,
              );
              const record = assets._embedded.records[0];
              if (record?.flags?.auth_clawback_enabled === true) clawback = true;
            } catch {
              // Asset record optional; account flags still used.
            }
            issuerFlags = {
              authRequired: Boolean(issuerAccount.flags?.auth_required),
              authRevocable: Boolean(issuerAccount.flags?.auth_revocable),
              authImmutable: Boolean(issuerAccount.flags?.auth_immutable),
              authClawbackEnabled: clawback,
              issuerExists: true,
            };
          } catch {
            issuerFlags = {
              authRequired: false,
              authRevocable: false,
              authImmutable: false,
              authClawbackEnabled: false,
              issuerExists: false,
            };
            issuerFlagsUnavailable = false;
          }
        }

        const events: ControlEvent[] = [];
        const seenIds = new Set<string>();
        const seenCursors = new Set<string>();
        let cursor = "";
        let duplicatePage = false;
        let pagesRead = 0;
        let exhausted = true;

        if (input.asset.kind === "classic" || input.asset.kind === "native") {
          exhausted = false;
          for (let page = 0; page < input.maxPages; page += 1) {
            pagesRead += 1;
            const path = `/accounts/${encodeURIComponent(input.account)}/effects?order=desc&limit=${input.pageSize}${
              cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
            }`;
            const effectsPage = await getJson<{ _embedded: { records: RawEffect[] } }>(base, path);
            const records = effectsPage._embedded.records;
            if (!records.length) {
              exhausted = true;
              break;
            }
            for (const effect of records) {
              if (seenIds.has(effect.id)) continue;
              if (!matchesAsset(effect, input.asset.assetKey, input.asset.code, input.asset.issuer)) continue;
              seenIds.add(effect.id);
              events.push(mapEffect(effect, source));
            }
            const next = records.at(-1)?.paging_token;
            if (!next || seenCursors.has(next)) {
              duplicatePage = Boolean(next);
              exhausted = !next;
              break;
            }
            seenCursors.add(next);
            cursor = next;
            if (records.length < input.pageSize) {
              exhausted = true;
              break;
            }
          }
        }

        return {
          ledger: Number(observed.sequence),
          closeTime: observed.closed_at,
          source,
          accountBalances,
          accountMissing,
          issuerFlags,
          issuerFlagsUnavailable,
          events,
          pagesRead,
          duplicatePage,
          truncated: !exhausted && pagesRead >= input.maxPages,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Horizon read failed");
      }
    }
    throw lastError ?? new Error("Issuer-control providers unavailable");
  }
}
