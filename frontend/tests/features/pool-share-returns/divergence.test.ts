import { describe, expect, it } from "vitest";
import { calculateDivergenceLoss } from "@/server/research/pool-share-returns/divergenceLoss";

describe("divergenceLoss", () => {
  it("calculates divergence loss", () => {
    const loss = calculateDivergenceLoss("1100", "1050", "15");
    expect(loss).toBe("35");
  });

  it("handles no divergence", () => {
    const loss = calculateDivergenceLoss("1000", "985", "15");
    expect(loss).toBe("0");
  });

  it("handles pool outperformance (negative loss)", () => {
    const loss = calculateDivergenceLoss("1000", "1050", "15");
    const lossNum = Number(loss);
    expect(lossNum).toBeLessThan(0);
  });
});
