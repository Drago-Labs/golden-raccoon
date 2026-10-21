/**
 * Read one account from Horizon and the provider's ledger window.
 *
 * The account document carries balances, sequence, and trustlines, stamped
 * with a single `last_modified_ledger`. Horizon has no contract-data endpoint,
 * so contract targets only contribute the provider window. This module does
 * not call RPC.
 */
import { available, unavailable, type ProviderState } from "./errors";
import { clampList, CONSISTENCY_LIMITS } from "./limits";
import type { HorizonAccount, HorizonObservation, HorizonTrustline, ProbeTarget } from "./schema";

type FetchLike = typeof fetch;

type JsonResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asLedger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);

  return null;
}

async function getJson(url: string, fetchImpl: FetchLike): Promise<JsonResult> {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(CONSISTENCY_LIMITS.timeoutMs),
  });
  const text = await response.text();
  let body: unknown = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  return { ok: response.ok, status: response.status, body };
}

export function parseHorizonAccount(body: unknown): { account: HorizonAccount; omittedTrustlines: number } {
  const record = asRecord(body);
  const balances = Array.isArray(record?.balances) ? record.balances : [];
  let nativeBalance: string | null = null;
  let nativeRaw: unknown = null;
  const trustlines: HorizonTrustline[] = [];

  for (const item of balances) {
    const balance = asRecord(item);

    if (!balance) continue;

    const assetType = asString(balance.asset_type);

    if (assetType === "native") {
      if (nativeBalance == null) {
        nativeBalance = asString(balance.balance);
        nativeRaw = item;
      }
      continue;
    }

    if (assetType !== "credit_alphanum4" && assetType !== "credit_alphanum12") continue;

    const code = asString(balance.asset_code);
    const issuer = asString(balance.asset_issuer);

    if (!code || !issuer) continue;

    trustlines.push({
      code,
      issuer,
      balance: asString(balance.balance),
      limit: asString(balance.limit),
      raw: item,
    });
  }

  const clamped = clampList(trustlines, CONSISTENCY_LIMITS.maxTrustlines);

  return {
    account: {
      ledger: asLedger(record?.last_modified_ledger),
      sequence: asString(record?.sequence),
      nativeBalance,
      nativeRaw,
      trustlines: clamped.kept,
      raw: body,
    },
    omittedTrustlines: clamped.omitted,
  };
}

export async function readHorizon(
  target: ProbeTarget,
  fetchImpl: FetchLike = fetch,
): Promise<ProviderState<HorizonObservation>> {
  try {
    const root = await getJson(target.horizonUrl, fetchImpl);

    if (!root.ok) {
      return unavailable(`Horizon returned HTTP ${root.status} for the network root.`);
    }

    const rootBody = asRecord(root.body);

    if (!rootBody) {
      return unavailable("Horizon root was not a JSON object.");
    }

    const latest = asLedger(rootBody.history_latest_ledger);
    let account: HorizonAccount | null = null;
    let notFound = false;
    let omittedTrustlines = 0;

    if (target.kind === "account") {
      const accountUrl = `${target.horizonUrl}/accounts/${encodeURIComponent(target.id)}`;
      const accountResponse = await getJson(accountUrl, fetchImpl);

      if (accountResponse.status === 404) {
        notFound = true;
      } else if (!accountResponse.ok) {
        return unavailable(`Horizon returned HTTP ${accountResponse.status} for the account.`);
      } else {
        const parsed = parseHorizonAccount(accountResponse.body);
        account = parsed.account;
        omittedTrustlines = parsed.omittedTrustlines;
      }
    }

    return available({
      provider: "horizon",
      network: target.network,
      endpoint: target.horizonUrl,
      passphrase: asString(rootBody.network_passphrase),
      latestLedger: latest,
      retentionStartLedger: asLedger(rootBody.history_elder_ledger),
      retentionEndLedger: latest,
      notFound,
      account,
      contractDataExposed: false,
      contractEntries: [],
      omittedTrustlines,
      omittedLedgerKeys: 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Horizon could not be read.";

    return unavailable(message);
  }
}
