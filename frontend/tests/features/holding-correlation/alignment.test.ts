import { describe, expect, it } from "vitest";
import { alignReturnSeries } from "@/server/research/holding-correlation";

describe("alignReturnSeries", () => {
  it("keeps only overlapping return timestamps and never shifts misaligned series", () => {
    const a = [
      { timestamp: 100, price: 10 },
      { timestamp: 200, price: 11 },
      { timestamp: 300, price: 12.1 },
    ];
    const b = [
      { timestamp: 200, price: 20 },
      { timestamp: 300, price: 24 },
      { timestamp: 400, price: 25 },
    ];
    const aligned = alignReturnSeries(a, b);
    expect(aligned.timestamps).toEqual([300]);
    expect(aligned.returnsA[0]).toBeCloseTo(0.1, 6);
    expect(aligned.returnsB[0]).toBeCloseTo(0.2, 6);
  });
});
