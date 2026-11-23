import { describe, expect, it } from "vitest";
import { decimalAdd, decimalSubtract, decimalMultiply, decimalDivide, stroopsToDecimal, decimalToStroops } from "@/server/research/pool-share-returns/decimalMath";

describe("decimalMath", () => {
  it("converts stroops to decimal", () => {
    expect(stroopsToDecimal("10000000")).toBe("1");
    expect(stroopsToDecimal("15000000")).toBe("1.5");
    expect(stroopsToDecimal("0")).toBe("0");
  });

  it("converts decimal to stroops", () => {
    expect(decimalToStroops("1")).toBe("10000000");
    expect(decimalToStroops("1.5")).toBe("15000000");
    expect(decimalToStroops("0")).toBe("0");
  });

  it("adds decimals", () => {
    expect(decimalAdd("1.5", "2.3")).toBe("3.8");
    expect(decimalAdd("0", "1")).toBe("1");
  });

  it("subtracts decimals", () => {
    expect(decimalSubtract("5.5", "2.3")).toBe("3.2");
    expect(decimalSubtract("1", "1")).toBe("0");
  });

  it("multiplies decimals", () => {
    expect(decimalMultiply("2", "3")).toBe("6");
    expect(decimalMultiply("1.5", "2")).toBe("3");
  });

  it("divides decimals", () => {
    expect(decimalDivide("6", "2")).toBe("3");
    expect(decimalDivide("3", "2")).toBe("1.5");
  });

  it("maintains precision within one stroop", () => {
    const a = "1.0000001";
    const b = "2.0000001";
    const sum = decimalAdd(a, b);
    const sumStroops = BigInt(decimalToStroops(sum));
    const expectedStroops = BigInt(decimalToStroops(a)) + BigInt(decimalToStroops(b));
    expect(sumStroops - expectedStroops).toBeLessThanOrEqual(1n);
  });
});
