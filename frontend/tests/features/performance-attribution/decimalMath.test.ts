import { describe, expect, it } from "vitest";
import {
  formatFixed,
  formatQuantity,
  formatUsd,
  parseFixed,
  parseQuantity,
  parseUsd,
  QUANTITY_SCALE,
  quantityTimesPrice,
  shareBps,
  sum,
  USD_SCALE,
} from "@/server/research/performance-attribution/decimalMath";
import { AttributionError } from "@/server/research/performance-attribution/errors";

describe("parsing fixed-point amounts", () => {
  it("parses USD at eight decimals and quantities at eighteen", () => {
    expect(parseUsd("1")).toBe(USD_SCALE);
    expect(parseUsd("2000.5")).toBe(200_050_000_000n);
    expect(parseUsd(-12.25)).toBe(-1_225_000_000n);
    expect(parseQuantity("10")).toBe(10n * QUANTITY_SCALE);
  });

  it("truncates beyond the scale rather than rounding up", () => {
    expect(parseFixed("1.999999999", 8)).toBe(199_999_999n);
    expect(parseFixed("-1.999999999", 8)).toBe(-199_999_999n);
  });

  it("refuses anything that is not a decimal amount", () => {
    expect(() => parseUsd("1e9")).toThrowError(AttributionError);
    expect(() => parseUsd("abc")).toThrowError(/not a usable/);
    expect(() => parseUsd(Number.NaN)).toThrowError(/not a usable/);
  });
});

describe("rendering fixed-point amounts", () => {
  it("keeps the sign and drops trailing zeros", () => {
    expect(formatUsd(200_050_000_000n)).toBe("2000.5");
    expect(formatUsd(-100_000_000n)).toBe("-1");
    expect(formatUsd(0n)).toBe("0");
    expect(formatQuantity(QUANTITY_SCALE / 2n)).toBe("0.5");
    expect(formatFixed(12_345n, 2)).toBe("123.45");
  });
});

describe("quantityTimesPrice", () => {
  it("multiplies a quantity by a USD price per unit", () => {
    // 10 units × 200 USD = 2,000 USD.
    expect(quantityTimesPrice(parseQuantity("10"), parseUsd("200"))).toBe(parseUsd("2000"));
  });

  it("keeps the sign of a negative price move", () => {
    expect(quantityTimesPrice(parseQuantity("10"), parseUsd("-100"))).toBe(parseUsd("-1000"));
  });

  it("truncates towards zero in both directions", () => {
    expect(quantityTimesPrice(1n, parseUsd("1"))).toBe(0n);
    expect(quantityTimesPrice(-1n, parseUsd("1"))).toBe(0n);
    expect(quantityTimesPrice(parseQuantity("0.000000005"), parseUsd("1"))).toBe(0n);
  });
});

describe("sum and shareBps", () => {
  it("sums exactly", () => {
    expect(sum([1n, 2n, -4n])).toBe(-1n);
    expect(sum([])).toBe(0n);
  });

  it("states a share in basis points with two decimals", () => {
    expect(shareBps(parseUsd("250"), parseUsd("1000"))).toBe("2500");
    expect(shareBps(parseUsd("-250"), parseUsd("1000"))).toBe("-2500");
    // A share of a negative total is stated against its magnitude, so a contributor
    // that moved the same way as the total reads as positive.
    expect(shareBps(parseUsd("-250"), parseUsd("-1000"))).toBe("-2500");
  });

  it("states no share when the total is zero", () => {
    expect(shareBps(parseUsd("1"), 0n)).toBeNull();
  });
});
