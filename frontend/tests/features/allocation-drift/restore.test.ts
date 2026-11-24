import { describe, expect, it } from "vitest";
import { allocationCoverage } from "@/server/research/allocation-drift/coverage";
import { restoreAmounts } from "@/server/research/allocation-drift/restoreAmounts";
import { units } from "@/server/research/allocation-drift/weights";
import { currentSnapshot, unpricedSnapshot } from "./fixtures";

const total = units("100000");

describe("restoreAmounts", () => {
  it("states how much value to remove when a holding is above target", () => {
    // 50% of 100,000 is 50,000; the wallet holds 60,000 at 2,500 USD per unit.
    expect(restoreAmounts(total, units("60000"), 5000, "2500.00000000", true)).toEqual({
      restoreUsd: "-10000",
      restoreQuantity: "-4",
    });
  });

  it("states how much value to add when a holding is below target", () => {
    expect(restoreAmounts(total, units("30000"), 4000, "1.00000000", true)).toEqual({
      restoreUsd: "10000",
      restoreQuantity: "10000",
    });
  });

  it("states zero for a holding already on target", () => {
    expect(restoreAmounts(total, units("10000"), 1000, "1.00000000", true)).toEqual({
      restoreUsd: "0",
      restoreQuantity: "0",
    });
  });

  it("keeps eighteen decimal places on an uneven quantity", () => {
    expect(restoreAmounts(total, units("0"), 1, "3.00000000", true).restoreQuantity).toBe("3.333333333333333333");
  });

  it("withholds a quantity when the holding has no usable price", () => {
    expect(restoreAmounts(total, units("30000"), 4000, null, true)).toEqual({ restoreUsd: "10000", restoreQuantity: null });
    expect(restoreAmounts(total, units("30000"), 4000, "0.00000000", true).restoreQuantity).toBeNull();
  });

  it("withholds both amounts when the valuation is incomplete or the portfolio has no value", () => {
    expect(restoreAmounts(total, units("30000"), 4000, "1.00000000", false)).toEqual({
      restoreUsd: null,
      restoreQuantity: null,
    });
    expect(restoreAmounts(0n, 0n, 4000, "1.00000000", true)).toEqual({ restoreUsd: null, restoreQuantity: null });
  });

  it("never returns anything a caller could submit as a transaction", () => {
    const amounts = restoreAmounts(total, units("60000"), 5000, "2500.00000000", true);
    expect(Object.keys(amounts).sort()).toEqual(["restoreQuantity", "restoreUsd"]);
  });
});

describe("allocationCoverage", () => {
  const start = "2026-10-25T00:00:00.000Z";

  it("declares the measurement complete when priced observations cover the window", () => {
    const coverage = allocationCoverage(currentSnapshot(), 2, "2026-10-24T00:00:00.000Z", start);
    expect(coverage.partial).toBe(false);
    expect(coverage.notes).toHaveLength(2);
    expect(coverage.notes[0]).toMatch(/USD market values/);
  });

  it("explains an incomplete valuation rather than treating an unpriced holding as zero", () => {
    const coverage = allocationCoverage(unpricedSnapshot(), 2, "2026-10-24T00:00:00.000Z", start);
    expect(coverage.partial).toBe(true);
    expect(coverage.notes.join(" ")).toMatch(/no usable price/);
  });

  it("explains a history too short to show development", () => {
    const coverage = allocationCoverage(currentSnapshot(), 1, "2026-11-20T00:00:00.000Z", start);
    expect(coverage.partial).toBe(true);
    expect(coverage.notes.join(" ")).toMatch(/Fewer than two usable observations/);
  });

  it("explains a window that starts before the first recorded observation", () => {
    const missing = allocationCoverage(currentSnapshot(), 2, undefined, start);
    const late = allocationCoverage(currentSnapshot(), 2, "2026-11-01T00:00:00.000Z", start);
    expect(missing.partial).toBe(true);
    expect(late.notes.join(" ")).toMatch(/do not cover the beginning/);
  });
});
