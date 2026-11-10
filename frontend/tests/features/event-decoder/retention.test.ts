import { describe, expect, it } from "vitest";
import { assessRetentionWindow } from "@/server/research/event-decoder";

describe("assessRetentionWindow", () => {
  it("flags ledgers older than earliestRetainedLedger as unavailable rather than absent", () => {
    const res = assessRetentionWindow({
      startLedger: 900000,
      endLedger: 900500,
      earliestRetainedLedger: 900250,
      latestLedger: 901000,
    });
    expect(res.outsideRetention).toBe(true);
    expect(res.unretainedLedgerCount).toBe(250);
    expect(res.statusMessage).toMatch(/outside RPC retention/);
  });
});
