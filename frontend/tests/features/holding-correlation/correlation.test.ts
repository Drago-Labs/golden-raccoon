import { describe, expect, it } from "vitest";
import { computePearson, computeSpearman } from "@/server/research/holding-correlation";

describe("correlation math", () => {
  it("computes +1.0 for perfectly proportional return series", () => {
    const x = [0.01, -0.02, 0.03, 0.04, -0.01];
    const y = x.map((v) => v * 2);
    expect(computePearson(x, y)).toBeCloseTo(1, 5);
    expect(computeSpearman(x, y)).toBeCloseTo(1, 5);
  });

  it("computes -1.0 for perfectly inverse return series", () => {
    const x = [0.01, -0.02, 0.03, 0.04, -0.01];
    const y = x.map((v) => -v);
    expect(computePearson(x, y)).toBeCloseTo(-1, 5);
    expect(computeSpearman(x, y)).toBeCloseTo(-1, 5);
  });

  it("returns null when variance is zero", () => {
    expect(computePearson([0.01, 0.01, 0.01], [0.01, 0.02, 0.03])).toBeNull();
  });
});
