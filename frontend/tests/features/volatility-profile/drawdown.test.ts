import { describe, expect, it } from "vitest";
import { computeDrawdownSummary } from "@/server/research/volatility-profile";
import crash from "./data/crash-and-recovery.json";

describe("computeDrawdownSummary", () => {
  it("computes peak-to-trough drawdown and recovery duration accurately", () => {
    const dd = computeDrawdownSummary(crash.observations);
    expect(dd.maxDrawdownPct).toBeCloseTo(50, 4);
    expect(dd.peakTimestamp).toBe(86400 * 1);
    expect(dd.troughTimestamp).toBe(86400 * 3);
    expect(dd.recoveryTimestamp).toBe(86400 * 5);
    expect(dd.drawdownDurationSeconds).toBe(86400 * 2);
    expect(dd.recoveryDurationSeconds).toBe(86400 * 2);
  });
});
