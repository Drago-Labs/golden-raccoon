import { parseQuantity, parseUsd } from "./decimalMath";
import { AttributionError } from "./errors";
import { ATTRIBUTION_LIMITS } from "./limits";
import { portfolioScope } from "./portfolioInput";
import { flowRecordSchema, type ExternalFlow } from "./schema";

/** One page of the repository's existing transaction-history read API. */
export type TransactionHistoryPage = {
  items: Array<Record<string, unknown>>;
  nextCursor?: string | null;
};

export type TransactionHistoryReader = (input: {
  walletAddress: string;
  cursor?: string;
  limit: number;
}) => Promise<TransactionHistoryPage>;

/**
 * Which recorded transaction types move value in or out of a portfolio. A swap
 * exchanges one holding for another inside the same portfolio, so it is not an
 * external flow and is deliberately absent from this list; counting it would
 * both add and remove the same value.
 */
const EXTERNAL_TYPES = new Set(["transfer"]);

function recordScope(record: Record<string, unknown>): string | null {
  const wallet = typeof record.walletAddress === "string" ? record.walletAddress : null;
  const network = typeof record.network === "string" ? record.network : null;
  return wallet && network ? portfolioScope(wallet, network) : null;
}

/**
 * Reads external flows from the existing transaction-history read API, pages
 * through it under the documented bounds, and keeps only settled transfers of
 * the requested portfolio. Nothing is written back.
 */
export async function readExternalFlows(
  read: TransactionHistoryReader,
  scope: { walletAddress: string; network: string },
  window: { startMs: number; endMs: number },
): Promise<{ flows: ExternalFlow[]; truncated: boolean }> {
  const flows: ExternalFlow[] = [];
  let cursor: string | undefined;
  let truncated = false;

  for (let page = 0; page < ATTRIBUTION_LIMITS.maxFlowPages; page += 1) {
    const result = await read({ walletAddress: scope.walletAddress, cursor, limit: ATTRIBUTION_LIMITS.flowPageSize });
    const items = Array.isArray(result.items) ? result.items : null;
    if (!items) throw new AttributionError("provider_unavailable", "The transaction-history read API returned no items.");

    for (const record of items) {
      const type = typeof record.type === "string" ? record.type : "";
      if (!EXTERNAL_TYPES.has(type)) continue;
      const status = typeof record.lifecycleStatus === "string" ? record.lifecycleStatus : record.status;
      if (typeof status === "string" && !["confirmed", "finalized", "succeeded", "success"].includes(status)) continue;
      if (recordScope(record) !== portfolioScope(scope.walletAddress, scope.network)) continue;

      const at = typeof record.createdAt === "string" ? record.createdAt : null;
      const atMs = at ? Date.parse(at) : Number.NaN;
      if (!Number.isFinite(atMs) || atMs < window.startMs || atMs > window.endMs) continue;

      const valueUsd = typeof record.valueUsd === "number" && Number.isFinite(record.valueUsd) ? record.valueUsd : null;
      if (valueUsd === null) {
        throw new AttributionError("provider_unavailable", `Transfer ${String(record.hash ?? "")} has no recorded USD value.`);
      }
      const direction = valueUsd >= 0 ? "deposit" : "withdrawal";
      flows.push(
        normalizeFlow({
          id: String(record.hash ?? `${type}:${at}`),
          at: new Date(atMs).toISOString(),
          key: `${String(record.network)}:${String(record.asset ?? "unknown")}`.toLowerCase(),
          symbol: String(record.asset ?? "unknown").slice(0, 40),
          chain: String(record.network),
          valueUsd: valueUsd.toFixed(8),
          quantity: null,
          direction,
          source: "transaction-history read API",
          txId: typeof record.hash === "string" ? record.hash : null,
        }),
      );
      if (flows.length >= ATTRIBUTION_LIMITS.maxFlowRecords) {
        truncated = true;
        break;
      }
    }

    cursor = result.nextCursor ?? undefined;
    if (truncated || !cursor) break;
    if (page === ATTRIBUTION_LIMITS.maxFlowPages - 1 && cursor) truncated = true;
  }

  return { flows: flows.sort((left, right) => left.at.localeCompare(right.at)), truncated };
}

/** Validates and converts one flow record into exact integer units. */
export function normalizeFlow(input: unknown): ExternalFlow {
  const parsed = flowRecordSchema.safeParse(input);
  if (!parsed.success) {
    throw new AttributionError("provider_unavailable", "A transfer record is malformed.", parsed.error.flatten());
  }
  const record = parsed.data;
  const valueUsdUnits = parseUsd(record.valueUsd, `value of transfer ${record.id}`);
  const signed = record.direction === "withdrawal" ? -(valueUsdUnits < 0n ? -valueUsdUnits : valueUsdUnits) : valueUsdUnits;
  return {
    id: record.id,
    at: new Date(record.at).toISOString(),
    key: record.key,
    symbol: record.symbol,
    chain: record.chain,
    valueUsdUnits: signed,
    quantityUnits: record.quantity === null ? null : parseQuantity(record.quantity, `quantity of transfer ${record.id}`),
    direction: record.direction,
    source: record.source,
    txId: record.txId,
  };
}
