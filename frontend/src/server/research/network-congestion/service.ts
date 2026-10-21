/**
 * Explain capacity, surge periods, and inclusion fees for one ledger window.
 *
 * The reader is an argument. Fixture tests pass a recorded window and do not
 * open a socket. The report never adds a classic inclusion fee to a Soroban
 * resource fee, and sequences the reader did not return stay in `gaps`.
 */
import { findLedgerGaps, summarizeCapacity, uniqueLedgers } from "./capacity";
import { buildCoverage } from "./coverage";
import { NetworkCongestionError } from "./errors";
import { summarizeFees } from "./feePercentiles";
import { CONGESTION_LIMITS } from "./limits";
import { assertPassphrase, identifyNetwork } from "./networkIdentity";
import type { LedgerReader } from "./ledgerReader";
import {
  CONGESTION_SCHEMA_VERSION,
  congestionRequestSchema,
  type CongestionReport,
  type CongestionRequest,
  type ObservedLedger,
} from "./schema";
import { detectSurges } from "./surgeDetection";
import { expandAround, resolveClosedLedger } from "./timestampLookup";

function assertOrder(fromSequence: number, toSequence: number): void {
  if (toSequence < fromSequence) {
    throw new NetworkCongestionError("window_inverted", "The window ends before it begins.");
  }

  if (toSequence - fromSequence + 1 > CONGESTION_LIMITS.maxLedgers) {
    throw new NetworkCongestionError("window_too_large", `The window is longer than ${CONGESTION_LIMITS.maxLedgers} ledgers.`);
  }
}

async function resolveWindow(
  request: CongestionRequest,
  network: CongestionReport["network"],
  reader: LedgerReader,
): Promise<{ fromSequence: number; toSequence: number; fromTime: string | null; toTime: string | null; focus: { sequence: number; closedAt: string | null; note: string } | null }> {
  if (request.fromSequence !== undefined && request.toSequence !== undefined) {
    assertOrder(request.fromSequence, request.toSequence);

    return { fromSequence: request.fromSequence, toSequence: request.toSequence, fromTime: null, toTime: null, focus: null };
  }

  if (request.atLedger !== undefined) {
    const radius = request.radius ?? CONGESTION_LIMITS.defaultRadius;
    const window = expandAround(request.atLedger, radius);
    assertOrder(window.fromSequence, window.toSequence);

    return {
      ...window,
      fromTime: null,
      toTime: null,
      focus: { sequence: request.atLedger, closedAt: null, note: "" },
    };
  }

  if (request.fromTime !== undefined && request.toTime !== undefined) {
    if (Date.parse(request.toTime) < Date.parse(request.fromTime)) {
      throw new NetworkCongestionError("window_inverted", "The window ends before it begins.");
    }

    const from = await resolveAt(network, reader, request.fromTime);
    const to = await resolveAt(network, reader, request.toTime);
    assertOrder(from.sequence, to.sequence);

    return {
      fromSequence: from.sequence,
      toSequence: to.sequence,
      fromTime: request.fromTime,
      toTime: request.toTime,
      focus: null,
    };
  }

  if (request.atTime !== undefined) {
    const match = await resolveAt(network, reader, request.atTime);
    const radius = request.radius ?? CONGESTION_LIMITS.defaultRadius;
    const window = expandAround(match.sequence, radius);
    assertOrder(window.fromSequence, window.toSequence);

    return {
      ...window,
      fromTime: null,
      toTime: null,
      focus: {
        sequence: match.sequence,
        closedAt: match.closedAt,
        note: `Ledger ${match.sequence} closed at ${match.closedAt}, the latest close at or before ${request.atTime}.`,
      },
    };
  }

  throw new NetworkCongestionError("invalid_request", "The window could not be read.");
}

async function resolveAt(network: CongestionReport["network"], reader: LedgerReader, at: string) {
  const latest = await reader.readLatest(network);

  return resolveClosedLedger({
    latest: { sequence: latest.sequence, closedAt: latest.closedAt },
    at,
    readHeader: async (sequence) => {
      const header = await reader.readHeader(network, sequence);

      return header ? { sequence: header.sequence, closedAt: header.closedAt } : null;
    },
  });
}

function counts(ledgers: readonly ObservedLedger[]) {
  return {
    omittedTransactionCount: ledgers.reduce((sum, ledger) => sum + ledger.omittedTransactionCount, 0),
    unsplitCount: ledgers.reduce((sum, ledger) => sum + ledger.transactions.filter((transaction) => transaction.split === "unsplit").length, 0),
  };
}

export async function explainCongestion(input: unknown, reader: LedgerReader): Promise<CongestionReport> {
  const parsed = congestionRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new NetworkCongestionError("invalid_request", "The congestion request could not be read.", parsed.error.flatten());
  }

  const network = identifyNetwork(parsed.data.network);
  const resolved = await resolveWindow(parsed.data, network, reader);
  const read = await reader.readRange(network, resolved.fromSequence, resolved.toSequence);

  assertPassphrase(network, read.passphrase);

  const ledgers = uniqueLedgers(read.ledgers).filter(
    (ledger) => ledger.sequence >= resolved.fromSequence && ledger.sequence <= resolved.toSequence,
  );
  const gaps = findLedgerGaps(resolved.fromSequence, resolved.toSequence, ledgers.map((ledger) => ledger.sequence));
  const feeCounts = counts(ledgers);
  const focusLedger = resolved.focus ? ledgers.find((ledger) => ledger.sequence === resolved.focus?.sequence) : undefined;
  const lookup = resolved.focus
    ? {
        matchedSequence: resolved.focus.sequence,
        matchedClosedAt: resolved.focus.closedAt ?? focusLedger?.closedAt ?? null,
        note:
          resolved.focus.note ||
          (focusLedger
            ? `Ledger ${focusLedger.sequence} closed at ${focusLedger.closedAt}.`
            : `Ledger ${resolved.focus.sequence} is missing from this window and is excluded from statistics.`),
      }
    : null;

  return {
    schemaVersion: CONGESTION_SCHEMA_VERSION,
    network,
    window: {
      fromSequence: resolved.fromSequence,
      toSequence: resolved.toSequence,
      fromTime: resolved.fromTime,
      toTime: resolved.toTime,
      focusSequence: resolved.focus?.sequence ?? null,
    },
    capacity: summarizeCapacity(ledgers, gaps),
    surges: detectSurges(ledgers),
    fees: summarizeFees(ledgers),
    lookup,
    coverage: buildCoverage({
      presentLedgerCount: ledgers.length,
      gaps,
      truncated: read.truncated,
      omittedTransactionCount: feeCounts.omittedTransactionCount,
      unsplitCount: feeCounts.unsplitCount,
    }),
    readOnly: true,
  };
}
