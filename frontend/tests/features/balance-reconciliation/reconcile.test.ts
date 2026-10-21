import { describe, expect, it } from "vitest";
import { claimMatch, reconcileAssets } from "@/server/research/balance-reconciliation/reconcile";

describe("reconciliation deltas", () => {
  it("reports an exact stroop delta and refuses to call truncated history a match", () => {
    const reconstructed = new Map<string, bigint>([["native", 20_000_000n]]);
    const recorded = new Map<string, bigint>([["native", 20_000_002n]]);
    const rows = reconcileAssets(reconstructed, recorded, new Map([["native", 10_000_000n]]));

    expect(rows[0]?.deltaStroops).toBe("2");
    expect(claimMatch(rows, false, 0)).toBe(false);

    const matched = reconcileAssets(reconstructed, reconstructed, new Map([["native", 10_000_000n]]));
    expect(claimMatch(matched, false, 0)).toBe(true);
    expect(claimMatch(matched, true, 0)).toBe(false);
    expect(reconcileAssets(reconstructed, null, new Map())[0]?.deltaStroops).toBeNull();
  });
});
