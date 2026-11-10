import type { EventMatchResult } from "./eventMatcher";
import { decodeScVal } from "./scvalDecoder";
import type { DecodedContractEvent, RawContractEvent } from "./schema";

export function formatDecodedContractEvent(
  raw: RawContractEvent,
  match: EventMatchResult,
): DecodedContractEvent {
  return {
    eventId: raw.eventId,
    ledger: raw.ledger,
    txHash: raw.txHash,
    matchedSpecName: match.specName,
    mismatchReason: match.mismatchReason,
    fields: match.fields,
    rawTopicsDisplay: raw.topics.map((t) => `${t.type}:${decodeScVal(t)}`),
    rawDataDisplay: `${raw.data.type}:${decodeScVal(raw.data)}`,
  };
}
