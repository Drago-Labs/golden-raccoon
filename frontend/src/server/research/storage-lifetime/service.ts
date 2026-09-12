import type { z } from "zod";
import { coverage } from "./coverage";
import { diagnose } from "./diagnostics";
import { RpcStorageEntryReader, type StorageEntryReader } from "./entryReader";
import { flattenFootprint } from "./footprintInput";
import { decodeLedgerKey } from "./ledgerKeyDecoder";
import { storageRequestSchema, type StorageDiagnostics } from "./schema";

type StorageRequest = z.infer<typeof storageRequestSchema>;

export async function inspectStorageLifetime(
  request: StorageRequest,
  dependencies: { reader?: StorageEntryReader } = {},
): Promise<StorageDiagnostics> {
  const encodedKeys = flattenFootprint(request);
  const decodedKeys = encodedKeys.map((key) => decodeLedgerKey(key, request.contractId));
  const supportedKeys = decodedKeys.filter((item) => item.kind !== "unsupported");

  if (supportedKeys.length === 0) {
    return {
      contractId: request.contractId,
      network: request.network,
      state: "partial",
      observedLedger: null,
      source: null,
      entries: decodedKeys.map((item) => diagnose(item, 0)),
      coverage: coverage(0, 0),
      warnings: ["No supported contract storage keys were supplied."],
    };
  }

  try {
    const evidence = await (dependencies.reader ?? new RpcStorageEntryReader()).read(
      supportedKeys.map((item) => item.value),
      request.network,
    );
    const returnedByKey = new Map(
      evidence.entries.map((entry) => [entry.key.toXdr("base64"), entry] as const),
    );
    const entries = decodedKeys.map((item) =>
      diagnose(item, evidence.latestLedger, returnedByKey.get(item.xdr)),
    );
    const isPartial = entries.some((entry) =>
      ["missing", "unsupported", "unavailable"].includes(entry.state),
    );

    return {
      contractId: request.contractId,
      network: request.network,
      state: isPartial ? "partial" : "complete",
      observedLedger: evidence.latestLedger,
      source: evidence.source,
      entries,
      coverage: coverage(supportedKeys.length, evidence.entries.length),
      warnings: isPartial
        ? ["Incomplete evidence; inspect the per-key details before manual action."]
        : [],
    };
  } catch (error) {
    return {
      contractId: request.contractId,
      network: request.network,
      state: "unavailable",
      observedLedger: null,
      source: null,
      entries: decodedKeys.map((item) => ({
        ...diagnose(item, 0),
        state: item.kind === "unsupported" ? "unsupported" : "unavailable",
      })),
      coverage: coverage(supportedKeys.length, 0),
      warnings: [error instanceof Error ? error.message : "RPC unavailable"],
    };
  }
}
