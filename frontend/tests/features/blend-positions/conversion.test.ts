import { describe, expect, it } from "vitest";
import {
  convertBTokenToUnderlying,
  convertDTokenToUnderlying,
  formatTokenUnits,
} from "@/server/research/blend-positions";

describe("rateIndex conversions", () => {
  it("floors b-token supply conversion and ceils d-token debt conversion", () => {
    // 1000.0000000 bTokens at 1.1 rate (1_100_000_000) -> 1100.0000000 underlying
    const supply = convertBTokenToUnderlying("10000000000", "1100000000");
    expect(supply).toBe(11000000000n);
    expect(formatTokenUnits(supply, 7)).toBe("1100.0");

    // Non-divisible dToken product rounds up by 1 stroop
    const debt = convertDTokenToUnderlying("3", "1050000001");
    expect(debt).toBe(4n);
  });
});
