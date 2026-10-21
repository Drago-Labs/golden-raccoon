import { describe, expect, it } from "vitest";
import { detectSurges } from "@/server/research/network-congestion/surgeDetection";
import type { ObservedLedger } from "@/server/research/network-congestion/schema";
import { gapWindow, quietWindow, surgeWindow } from "./fixtures";

describe("surge detection", () => {
  it("lists no period when capacity was not full", () => {
    expect(detectSurges(quietWindow.ledgers)).toEqual([]);
  });

  it("keeps one contiguous full run and reports separate inclusion floors", () => {
    const [period] = detectSurges(surgeWindow.ledgers);

    expect(detectSurges(surgeWindow.ledgers)).toHaveLength(1);
    expect(period.fromSequence).toBe(200);
    expect(period.toSequence).toBe(202);
    expect(period.ledgerCount).toBe(3);
    expect(period.classicInclusionFloorStroops).toBe("200");
    expect(period.sorobanInclusionFloorStroops).toBe("1000");
    expect(period.pricedAboveBase).toBe(true);
    expect(period.baseFeeStroops).toBe(100);
    expect(JSON.stringify(period)).not.toContain("3000");
  });

  it("breaks a run at a missing sequence and again when capacity frees", () => {
    const periods = detectSurges(gapWindow.ledgers);

    expect(periods.map((period) => [period.fromSequence, period.toSequence, period.pricedAboveBase])).toEqual([
      [300, 301, true],
      [303, 303, false],
    ]);
    expect(periods[0].classicInclusionFloorStroops).toBe("200");
    expect(periods[1].classicInclusionFloorStroops).toBe("100");
    expect(periods[1].sorobanInclusionFloorStroops).toBeNull();
  });

  it("does not bridge two full ledgers across one that was not full", () => {
    const broken: ObservedLedger[] = [
      surgeWindow.ledgers[0],
      { ...surgeWindow.ledgers[1], operationCount: 1 },
      surgeWindow.ledgers[2],
    ];

    expect(detectSurges(broken).map((period) => [period.fromSequence, period.toSequence])).toEqual([
      [200, 200],
      [202, 202],
    ]);
  });
});
