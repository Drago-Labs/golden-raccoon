import { decodeScVal } from "./scvalDecoder";
import type { ContractEventSpecDef, DecodedField, RawContractEvent } from "./schema";

export type EventMatchResult = {
  matched: boolean;
  specName: string | null;
  mismatchReason: string | null;
  fields: DecodedField[];
};

export function matchEventAgainstSpecs(
  event: RawContractEvent,
  specs: ContractEventSpecDef[],
): EventMatchResult {
  if (specs.length === 0) {
    return {
      matched: false,
      specName: null,
      mismatchReason: "No event definitions found in contract Wasm spec",
      fields: [],
    };
  }

  const firstTopic = event.topics[0];
  if (!firstTopic || firstTopic.type !== "symbol") {
    return {
      matched: false,
      specName: null,
      mismatchReason: "First topic is not an event signature symbol",
      fields: [],
    };
  }

  const sig = firstTopic.value;
  const candidate = specs.find((s) => s.signatureSymbol === sig);
  if (!candidate) {
    return {
      matched: false,
      specName: null,
      mismatchReason: `No spec event definition matches topic symbol '${sig}'`,
      fields: [],
    };
  }

  if (event.topics.length !== candidate.topicCount) {
    return {
      matched: false,
      specName: null,
      mismatchReason: `Spec '${candidate.name}' expects ${candidate.topicCount} topics, but event has ${event.topics.length}`,
      fields: [],
    };
  }

  if (event.data.type !== candidate.dataType) {
    return {
      matched: false,
      specName: null,
      mismatchReason: `Spec '${candidate.name}' expects data type '${candidate.dataType}', but event data is '${event.data.type}'`,
      fields: [],
    };
  }

  const fields: DecodedField[] = [];
  for (const fieldDef of candidate.fields) {
    if (fieldDef.location === "topic") {
      const idx = fieldDef.topicIndex ?? 0;
      const topicVal = event.topics[idx];
      if (!topicVal || topicVal.type !== fieldDef.type) {
        return {
          matched: false,
          specName: null,
          mismatchReason: `Topic[${idx}] '${fieldDef.name}' expected '${fieldDef.type}', got '${topicVal?.type ?? "missing"}'`,
          fields: [],
        };
      }
      fields.push({
        name: fieldDef.name,
        type: fieldDef.type,
        location: "topic",
        value: decodeScVal(topicVal),
      });
    } else {
      fields.push({
        name: fieldDef.name,
        type: fieldDef.type,
        location: "data",
        value: decodeScVal(event.data),
      });
    }
  }

  return {
    matched: true,
    specName: candidate.name,
    mismatchReason: null,
    fields,
  };
}
