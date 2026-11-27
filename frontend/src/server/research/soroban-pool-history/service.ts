import { coverageNotice, driftNotice } from "./coverage";
import { parsePoolEvent, type ParsedPoolEvent, type RawPoolEvent } from "./eventLayouts";
import { readPoolEvents, type PoolEventRead, type ReadOutcome } from "./eventReader";
import { PoolHistoryError, type PoolHistoryState } from "./errors";
import { rankLargeTrades } from "./largeTrades";
import { normalizeLedgerRange } from "./ledgerRange";
import { validatePoolInput } from "./poolInput";
import { buildPriceSeries, impliedPrice } from "./priceSeries";
import { finalReserves, replayReserves } from "./reserveReplay";
import {
  POOL_HISTORY_SCHEMA_VERSION,
  poolHistoryRequestSchema,
  type CoverageGap,
  type PoolHistoryReport,
  type ReservePoint,
  type StellarNetwork,
} from "./schema";
import { checkStorageDrift } from "./storageCheck";

export type PoolHistoryDeps = {
  readEvents: (
    network: StellarNetwork,
    poolId: string,
    fromLedger: number,
    toLedger: number,
  ) => Promise<ReadOutcome<PoolEventRead>>;
};

const productionDeps: PoolHistoryDeps = {
  readEvents: readPoolEvents,
};

function unavailableReport(
  poolId: string,
  network: StellarNetwork,
  fromLedger: number,
  toLedger: number,
  reason: string,
): PoolHistoryReport {
  return {
    schemaVersion: POOL_HISTORY_SCHEMA_VERSION,
    poolId,
    network,
    fromLedger,
    toLedger,
    state: "unavailable",
    reserves: [],
    prices: [],
    largeTrades: [],
    drift: null,
    coverageGaps: [],
    coverageNotice: `${coverageNotice("unavailable", [], false)} ${reason}`,
    driftNotice: null,
    unsupportedLayouts: [],
    historyTruncated: false,
    readOnly: true,
  };
}

function toReservePoints(series: ReturnType<typeof replayReserves>): ReservePoint[] {
  return series.map((snapshot) => ({
    ledger: snapshot.ledger,
    reserveA: snapshot.reserveA.toString(),
    reserveB: snapshot.reserveB.toString(),
    price: impliedPrice(snapshot.reserveA, snapshot.reserveB),
    eventId: snapshot.eventId,
  }));
}

/**
 * Reconstruct constant-product pool reserves from contract events and compare with storage.
 * Unknown layouts become an unsupported state; truncated or missing storage is partial.
 */
export async function reconstructPoolHistory(
  input: unknown,
  deps: PoolHistoryDeps = productionDeps,
): Promise<PoolHistoryReport> {
  const parsed = poolHistoryRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new PoolHistoryError("invalid_request", "The pool history request is invalid.", parsed.error.flatten());
  }

  const validated = validatePoolInput(parsed.data);
  const range = normalizeLedgerRange(validated.fromLedger, validated.toLedger);
  const history = await deps.readEvents(validated.network, validated.poolId, range.fromLedger, range.toLedger);

  if (history.status === "unavailable") {
    return unavailableReport(validated.poolId, validated.network, range.fromLedger, range.toLedger, history.reason);
  }
  if (history.status === "missing") {
    throw new PoolHistoryError("not_found", "No pool contract was recorded for this id on the selected network.");
  }

  const unsupportedLayouts: string[] = [];
  const parsedEvents: ParsedPoolEvent[] = [];
  const unsupportedGaps: CoverageGap[] = [];

  for (const raw of history.value.events as RawPoolEvent[]) {
    const result = parsePoolEvent(raw);
    if (result.status === "unsupported") {
      unsupportedLayouts.push(result.topic);
      unsupportedGaps.push({
        fromLedger: raw.ledger,
        toLedger: raw.ledger,
        reason: "unknown_layout",
      });
      continue;
    }
    parsedEvents.push(result.event);
  }

  if (unsupportedLayouts.length > 0) {
    return {
      schemaVersion: POOL_HISTORY_SCHEMA_VERSION,
      poolId: validated.poolId,
      network: validated.network,
      fromLedger: range.fromLedger,
      toLedger: range.toLedger,
      state: "unsupported",
      reserves: [],
      prices: [],
      largeTrades: [],
      drift: null,
      coverageGaps: unsupportedGaps,
      coverageNotice: coverageNotice("unsupported", unsupportedGaps, history.value.truncated),
      driftNotice: null,
      unsupportedLayouts: [...new Set(unsupportedLayouts)],
      historyTruncated: history.value.truncated,
      readOnly: true,
    };
  }

  const series = replayReserves(
    history.value.openingReserveA,
    history.value.openingReserveB,
    parsedEvents,
    range.fromLedger,
  );
  const finals = finalReserves(series);
  const drift = checkStorageDrift(
    finals.reserveA,
    finals.reserveB,
    history.value.storageReserveA,
    history.value.storageReserveB,
  );
  const largeTrades = rankLargeTrades(parsedEvents, series);
  const prices = buildPriceSeries(series);

  const gaps: CoverageGap[] = [];
  if (history.value.truncated) {
    gaps.push({
      fromLedger: range.fromLedger,
      toLedger: range.toLedger,
      reason: "truncated_history",
    });
  }
  if (history.value.storageReserveA === null || history.value.storageReserveB === null) {
    gaps.push({
      fromLedger: range.toLedger,
      toLedger: range.toLedger,
      reason: "missing_storage",
    });
  }

  let state: PoolHistoryState = "complete";
  if (gaps.length > 0 || !drift.matched) {
    state = "partial";
  }

  return {
    schemaVersion: POOL_HISTORY_SCHEMA_VERSION,
    poolId: validated.poolId,
    network: validated.network,
    fromLedger: range.fromLedger,
    toLedger: range.toLedger,
    state,
    reserves: toReservePoints(series),
    prices,
    largeTrades,
    drift,
    coverageGaps: gaps,
    coverageNotice: coverageNotice(state, gaps, history.value.truncated),
    driftNotice: driftNotice(drift),
    unsupportedLayouts: [],
    historyTruncated: history.value.truncated,
    readOnly: true,
  };
}
