import { assetKey, horizonBase, type AssetIdentity, type StellarNetwork } from "./assetIdentity";
import type { RawIssuerOperation } from "./classification";
import { decimalToStroops } from "./decimalMath";
import { IssuanceLedgerError } from "./errors";
import { ISSUANCE_LIMITS } from "./limits";

export type CheckpointSnapshot = {
  ledger: number;
  networkStroops: bigint | null;
};

export type IssuerRead = {
  operations: RawIssuerOperation[];
  openingStroops: bigint;
  checkpoints: CheckpointSnapshot[];
  networkSupplyStroops: bigint | null;
  truncated: boolean;
  oldestLedger: number | null;
};

export type ReadOutcome<T> = { status: "ok"; value: T } | { status: "missing" } | { status: "unavailable"; reason: string };

type Paging = { pageSize: number; maxPages: number; maxOperations: number };

export function operationsUrl(network: StellarNetwork, issuer: string, cursor: string | null, pageSize: number = ISSUANCE_LIMITS.pageSize): string {
  const url = `${horizonBase(network)}/accounts/${encodeURIComponent(issuer)}/operations?limit=${pageSize}&order=asc&include_failed=false`;
  return cursor ? `${url}&cursor=${encodeURIComponent(cursor)}` : url;
}

export function assetSupplyUrl(network: StellarNetwork, asset: AssetIdentity): string {
  return `${horizonBase(network)}/assets?asset_code=${encodeURIComponent(asset.code)}&asset_issuer=${encodeURIComponent(asset.issuer)}&limit=1`;
}

async function readJson(url: string, fetchImpl: typeof fetch): Promise<ReadOutcome<unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ISSUANCE_LIMITS.timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (response.status === 404) return { status: "missing" };
    if (!response.ok) return { status: "unavailable", reason: `HTTP ${response.status}` };
    const text = await response.text();
    if (text.length > ISSUANCE_LIMITS.maxResponseBytes) {
      throw new IssuanceLedgerError("response_too_large", "The provider response exceeded the size limit.");
    }
    try {
      return { status: "ok", value: JSON.parse(text) as unknown };
    } catch {
      return { status: "unavailable", reason: "The provider response was not JSON." };
    }
  } catch (error) {
    if (error instanceof IssuanceLedgerError) throw error;
    return { status: "unavailable", reason: error instanceof Error ? error.message : "The provider request failed." };
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function recordsOf(body: unknown): unknown[] {
  const root = asRecord(body);
  const embedded = asRecord(root?._embedded);
  if (Array.isArray(embedded?.records)) return embedded.records;
  if (Array.isArray(root?.records)) return root.records;
  return [];
}

function normalizeOperation(raw: unknown): RawIssuerOperation | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = typeof row.id === "string" ? row.id : null;
  const type = typeof row.type === "string" ? row.type : null;
  const ledger = typeof row.ledger === "number" ? row.ledger : typeof row.ledger_attr === "number" ? row.ledger_attr : null;
  if (!id || !type || ledger === null) return null;
  return {
    id,
    pagingToken: typeof row.paging_token === "string" ? row.paging_token : undefined,
    type,
    ledger,
    source_account: typeof row.source_account === "string" ? row.source_account : undefined,
    from: typeof row.from === "string" ? row.from : undefined,
    to: typeof row.to === "string" ? row.to : undefined,
    amount: typeof row.amount === "string" ? row.amount : undefined,
    destination_amount: typeof row.destination_amount === "string" ? row.destination_amount : undefined,
    asset_type: typeof row.asset_type === "string" ? row.asset_type : undefined,
    asset_code: typeof row.asset_code === "string" ? row.asset_code : undefined,
    asset_issuer: typeof row.asset_issuer === "string" ? row.asset_issuer : undefined,
    transaction_hash: typeof row.transaction_hash === "string" ? row.transaction_hash : undefined,
    created_at: typeof row.created_at === "string" ? row.created_at : undefined,
  };
}

async function readOperationPages(
  network: StellarNetwork,
  issuer: string,
  fromLedger: number,
  toLedger: number,
  fetchImpl: typeof fetch,
  paging: Paging,
): Promise<ReadOutcome<{ operations: RawIssuerOperation[]; truncated: boolean }>> {
  const operations: RawIssuerOperation[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let truncated = false;
  let pages = 0;

  while (pages < paging.maxPages && operations.length < paging.maxOperations) {
    const outcome = await readJson(operationsUrl(network, issuer, cursor, paging.pageSize), fetchImpl);
    if (outcome.status !== "ok") {
      if (pages === 0) return outcome;
      truncated = true;
      break;
    }
    const page = recordsOf(outcome.value);
    pages += 1;
    let pastWindow = false;
    for (const record of page) {
      const op = normalizeOperation(record);
      if (!op) continue;
      const token = op.pagingToken ?? op.id;
      if (seen.has(token)) continue;
      seen.add(token);
      if (op.ledger < fromLedger) continue;
      if (op.ledger > toLedger) {
        pastWindow = true;
        break;
      }
      operations.push(op);
      if (operations.length >= paging.maxOperations) {
        truncated = true;
        break;
      }
    }
    if (pastWindow || truncated) break;
    const last = asRecord(page[page.length - 1]);
    const nextCursor = typeof last?.paging_token === "string" ? last.paging_token : null;
    const pageFull = page.length >= paging.pageSize;
    if (pageFull && pages >= paging.maxPages) {
      truncated = true;
      break;
    }
    if (!nextCursor || !pageFull) break;
    cursor = nextCursor;
  }

  return { status: "ok", value: { operations, truncated } };
}

async function readNetworkSupply(network: StellarNetwork, asset: AssetIdentity, fetchImpl: typeof fetch): Promise<ReadOutcome<bigint>> {
  const outcome = await readJson(assetSupplyUrl(network, asset), fetchImpl);
  if (outcome.status !== "ok") return outcome;
  const records = recordsOf(outcome.value);
  const first = asRecord(records[0]);
  if (!first) return { status: "missing" };
  const amount = typeof first.amount === "string" ? first.amount : null;
  if (!amount) return { status: "unavailable", reason: "Asset record had no amount." };
  try {
    return { status: "ok", value: decimalToStroops(amount) };
  } catch {
    return { status: "unavailable", reason: "Asset amount was not a usable decimal." };
  }
}

/**
 * Read issuer operations in the ledger window and the current network-reported supply.
 * Live Horizon supply is attached as a checkpoint at `toLedger` when available.
 */
export async function readIssuerHistory(
  network: StellarNetwork,
  asset: AssetIdentity,
  fromLedger: number,
  toLedger: number,
  fetchImpl: typeof fetch = fetch,
  paging: Paging = {
    pageSize: ISSUANCE_LIMITS.pageSize,
    maxPages: ISSUANCE_LIMITS.maxPages,
    maxOperations: ISSUANCE_LIMITS.maxOperations,
  },
): Promise<ReadOutcome<IssuerRead>> {
  const ops = await readOperationPages(network, asset.issuer, fromLedger, toLedger, fetchImpl, paging);
  if (ops.status !== "ok") return ops;

  const supply = await readNetworkSupply(network, asset, fetchImpl);
  const networkSupplyStroops = supply.status === "ok" ? supply.value : null;
  const ledgers = ops.value.operations.map((op) => op.ledger);
  const oldestLedger = ledgers.length === 0 ? null : Math.min(...ledgers);

  return {
    status: "ok",
    value: {
      operations: ops.value.operations,
      openingStroops: 0n,
      checkpoints: [{ ledger: toLedger, networkStroops: networkSupplyStroops }],
      networkSupplyStroops,
      truncated: ops.value.truncated,
      oldestLedger,
    },
  };
}

export function describeAsset(asset: AssetIdentity): string {
  return assetKey(asset);
}
