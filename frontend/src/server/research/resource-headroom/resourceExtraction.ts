import type { RawResourceMetrics, ResourceKey } from "./schema";

export const RESOURCE_DEFINITIONS: Array<{
  key: ResourceKey;
  label: string;
  unit: string;
}> = [
  { key: "instructions", label: "CPU Instructions", unit: "instructions" },
  { key: "memoryBytes", label: "Memory (RAM)", unit: "bytes" },
  { key: "readEntries", label: "Ledger Read Entries", unit: "entries" },
  { key: "writeEntries", label: "Ledger Write Entries", unit: "entries" },
  { key: "readBytes", label: "Ledger Read Bytes", unit: "bytes" },
  { key: "writeBytes", label: "Ledger Write Bytes", unit: "bytes" },
  { key: "txSizeBytes", label: "Transaction & Events Size", unit: "bytes" },
];

export function extractResourceMap(metrics: RawResourceMetrics): Record<ResourceKey, number> {
  return {
    instructions: metrics.instructions,
    memoryBytes: metrics.memoryBytes,
    readEntries: metrics.readEntries,
    writeEntries: metrics.writeEntries,
    readBytes: metrics.readBytes,
    writeBytes: metrics.writeBytes,
    txSizeBytes: metrics.txSizeBytes + metrics.eventsSizeBytes,
  };
}
