import { detectFormat } from "./formatDetection";
import type { HistoryEvent } from "./schema";
import { decodeDataValue } from "./valueDecoder";

export type RawManageData = {
  id: string;
  pagingToken: string;
  key: string;
  valueBase64: string | null;
  sourceAccount: string;
  ledger: number;
};

function valueFields(base64: string | null): Pick<HistoryEvent, "hex" | "utf8" | "format"> {
  if (base64 === null) return { hex: null, utf8: null, format: null };
  const decoded = decodeDataValue(base64);
  return { hex: decoded.hex, utf8: decoded.text ? decoded.utf8 : null, format: detectFormat(decoded) };
}

/**
 * Collapse duplicate operations and walk each key from oldest to newest.
 * A delete keeps the previous value so the removed entry is still visible.
 */
export function buildEntryHistory(operations: RawManageData[]): Map<string, HistoryEvent[]> {
  const seen = new Set<string>();
  const unique = operations.filter((operation) => {
    const token = operation.pagingToken || operation.id;
    if (seen.has(token)) return false;
    seen.add(token);
    return true;
  });
  const byKey = new Map<string, RawManageData[]>();
  for (const operation of unique) {
    const list = byKey.get(operation.key) ?? [];
    list.push(operation);
    byKey.set(operation.key, list);
  }

  const history = new Map<string, HistoryEvent[]>();
  for (const [key, list] of byKey) {
    list.sort((left, right) => left.ledger - right.ledger || left.pagingToken.localeCompare(right.pagingToken));
    const events: HistoryEvent[] = [];
    let previous: string | null = null;
    for (const operation of list) {
      if (operation.valueBase64 === null) {
        const last = valueFields(previous);
        events.push({
          ledger: operation.ledger,
          sourceAccount: operation.sourceAccount,
          action: "delete",
          valueBase64: null,
          hex: null,
          utf8: null,
          format: null,
          lastValueBase64: previous,
          lastValueUtf8: last.utf8,
        });
        previous = null;
        continue;
      }
      if (operation.valueBase64 === previous) continue;
      const fields = valueFields(operation.valueBase64);
      events.push({
        ledger: operation.ledger,
        sourceAccount: operation.sourceAccount,
        action: previous === null ? "set" : "change",
        valueBase64: operation.valueBase64,
        hex: fields.hex,
        utf8: fields.utf8,
        format: fields.format,
        lastValueBase64: operation.valueBase64,
        lastValueUtf8: fields.utf8,
      });
      previous = operation.valueBase64;
    }
    history.set(key, events);
  }
  return history;
}
