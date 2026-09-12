import { describe, expect, it, vi } from "vitest";
import type { StorageEntryReader } from "@/server/research/storage-lifetime/entryReader";
import { inspectStorageLifetime } from "@/server/research/storage-lifetime/service";
import { contractDataKey, validRequest } from "./fixtures";

describe("storage lifetime service", () => {
  it("matches sparse RPC results by ledger key instead of response position", async () => {
    const first = contractDataKey("persistent", true);
    const second = contractDataKey("temporary");
    const reader: StorageEntryReader = {
      read: vi.fn(async () => ({
        latestLedger: 1_000,
        entries: [{ key: second.key, liveUntilLedgerSeq: 1_020 }],
        source: "rpc.example",
      })),
    };

    const result = await inspectStorageLifetime(validRequest([first.encoded, second.encoded]), { reader });
    expect(result.state).toBe("partial");
    expect(result.entries.map((entry) => entry.state)).toEqual(["missing", "live"]);
    expect(result.coverage).toMatchObject({ requested: 2, returned: 1, missing: 1 });
  });

  it("returns explicit unavailable evidence when the RPC fails", async () => {
    const fixture = contractDataKey();
    const reader: StorageEntryReader = {
      read: vi.fn(async () => {
        throw new Error("all providers unavailable");
      }),
    };

    const result = await inspectStorageLifetime(validRequest([fixture.encoded]), { reader });
    expect(result).toMatchObject({ state: "unavailable", observedLedger: null, source: null });
    expect(result.entries[0].state).toBe("unavailable");
    expect(result.warnings).toContain("all providers unavailable");
  });
});
