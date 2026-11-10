import { EVENT_DECODER_LIMITS } from "./limits";
import type { EventDecoderNetwork } from "./networkIdentity";
import type { RawContractEvent, RawEventWindowResponse } from "./schema";

export interface ContractEventProvider {
  readContractEvents(input: {
    contractId: string;
    startLedger: number;
    endLedger: number;
    network: EventDecoderNetwork;
  }): Promise<RawEventWindowResponse>;
}

export function createDefaultEventReader(): ContractEventProvider {
  return {
    async readContractEvents({ startLedger, endLedger }) {
      return {
        earliestRetainedLedger: startLedger,
        latestLedger: endLedger,
        pages: [],
      };
    },
  };
}

/**
 * Merges paginated event batches, deduplicates by eventId, sorts by ledger ascending,
 * and enforces the maximum event bound.
 */
export function paginateAndDeduplicateEvents(pages: RawContractEvent[][]): {
  events: RawContractEvent[];
  duplicatesRemoved: number;
  truncated: boolean;
} {
  const seen = new Set<string>();
  const unique: RawContractEvent[] = [];
  let duplicatesRemoved = 0;

  for (const page of pages) {
    for (const ev of page) {
      if (seen.has(ev.eventId)) {
        duplicatesRemoved += 1;
        continue;
      }
      seen.add(ev.eventId);
      unique.push(ev);
    }
  }

  unique.sort((a, b) => a.ledger - b.ledger || a.eventId.localeCompare(b.eventId));
  const truncated = unique.length > EVENT_DECODER_LIMITS.maxEvents;
  return {
    events: unique.slice(0, EVENT_DECODER_LIMITS.maxEvents),
    duplicatesRemoved,
    truncated,
  };
}
