import { Networks } from "@stellar/stellar-sdk";
import { NetworkCongestionError } from "@/server/research/network-congestion/errors";
import type { LedgerReader } from "@/server/research/network-congestion/ledgerReader";
import type { ObservedLedger } from "@/server/research/network-congestion/schema";
import gapWindowJson from "./data/ledger-gap.json";
import providerUnavailableJson from "./data/provider-unavailable.json";
import quietWindowJson from "./data/quiet-window.json";
import surgeWindowJson from "./data/surge-window.json";

export type RecordedWindow = {
  request: { network: string; fromSequence: number; toSequence: number };
  passphrase: string;
  truncated: boolean;
  ledgers: ObservedLedger[];
};

export type ProviderFailure = {
  request: { network: string; fromSequence: number; toSequence: number };
  error: { code: "provider_unavailable"; message: string };
};

export const quietWindow = quietWindowJson as RecordedWindow;
export const surgeWindow = surgeWindowJson as RecordedWindow;
export const gapWindow = gapWindowJson as RecordedWindow;
export const providerUnavailable = providerUnavailableJson as ProviderFailure;

export function createRecordedReader(recorded: RecordedWindow): LedgerReader & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    async readLatest() {
      calls.push("readLatest");
      throw new Error("A recorded window does not resolve timestamps.");
    },
    async readHeader() {
      calls.push("readHeader");
      throw new Error("A recorded window does not resolve timestamps.");
    },
    async readRange(_network, fromSequence, toSequence) {
      calls.push(`readRange:${fromSequence}:${toSequence}`);

      return {
        passphrase: recorded.passphrase,
        truncated: recorded.truncated,
        ledgers: recorded.ledgers.filter((ledger) => ledger.sequence >= fromSequence && ledger.sequence <= toSequence),
      };
    },
  };
}

export function createUnavailableReader(message: string): LedgerReader & { calls: string[] } {
  const calls: string[] = [];
  const fail = (): never => {
    calls.push("fail");
    throw new NetworkCongestionError("provider_unavailable", message);
  };

  return {
    calls,
    readLatest: async () => fail(),
    readHeader: async () => fail(),
    readRange: async () => fail(),
  };
}

/**
 * Close times are five seconds apart and ledger 100 closes at the epoch below.
 * Every positive sequence has a header, so a timestamp search can probe freely.
 */
export function createTimelineReader(ledgers: ObservedLedger[]): LedgerReader & { calls: string[] } {
  const calls: string[] = [];
  const origin = Date.parse("2026-04-01T00:00:00.000Z");

  function closedAt(sequence: number): string {
    return new Date(origin + (sequence - 100) * 5_000).toISOString();
  }

  const latest = ledgers.reduce((highest, ledger) => Math.max(highest, ledger.sequence), 1);

  return {
    calls,
    async readLatest() {
      calls.push("readLatest");

      return {
        sequence: latest,
        closedAt: closedAt(latest),
        maxOperations: 100,
        txSetOperationCount: 1,
        baseFeeStroops: 100,
      };
    },
    async readHeader(_network, sequence) {
      calls.push(`readHeader:${sequence}`);

      if (sequence < 1) return null;

      return {
        sequence,
        closedAt: closedAt(sequence),
        maxOperations: 100,
        txSetOperationCount: 1,
        baseFeeStroops: 100,
      };
    },
    async readRange(_network, fromSequence, toSequence) {
      calls.push(`readRange:${fromSequence}:${toSequence}`);

      return {
        passphrase: Networks.PUBLIC,
        truncated: false,
        ledgers: ledgers.filter((ledger) => ledger.sequence >= fromSequence && ledger.sequence <= toSequence),
      };
    },
  };
}
