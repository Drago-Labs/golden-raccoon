import { describe, expect, it } from "vitest";
import { classifyLifetime, estimateSeconds } from "@/server/research/storage-lifetime/lifetime";
import { diagnose } from "@/server/research/storage-lifetime/diagnostics";
import { decodeLedgerKey } from "@/server/research/storage-lifetime/ledgerKeyDecoder";
import { contractDataKey, contractId } from "./fixtures";

describe("storage lifetime classification", () => {
  it("keeps an entry live through its liveUntil ledger and expires it afterward", () => {
    expect(classifyLifetime(100, 100)).toEqual({ state: "live", remaining: 0 });
    expect(classifyLifetime(101, 100)).toEqual({ state: "past_boundary", remaining: 0 });
    expect(estimateSeconds(12)).toBe(60);
  });

  it("shows durability and keeps a missing entry distinct from archival", () => {
    const fixture = contractDataKey("temporary");
    const decoded = decodeLedgerKey(fixture.encoded, contractId);
    const missing = diagnose(decoded, 900);

    expect(decoded).toMatchObject({ kind: "data", durability: "temporary" });
    expect(missing.state).toBe("missing");
    expect(missing.evidence.join(" ")).toContain("does not prove archival");
  });

  it("classifies instance keys and derives remaining ledgers from one observation", () => {
    const fixture = contractDataKey("persistent", true);
    const result = diagnose(decodeLedgerKey(fixture.encoded, contractId), 500, {
      liveUntilLedgerSeq: 520,
    });

    expect(result).toMatchObject({
      kind: "instance",
      durability: "persistent",
      state: "live",
      remainingLedgers: 20,
      estimatedSecondsRemaining: 100,
    });
  });
});
