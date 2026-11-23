import { describe, expect, it } from "vitest";
import { detectCoverageGaps } from "@/server/research/pool-share-returns/windowing";
import { mockReserveSnapshots, mockPricePoints } from "./fixtures";

describe("windowing", () => {
  it("detects no gaps with complete data", () => {
    const gaps = detectCoverageGaps(mockReserveSnapshots, mockPricePoints, 100, 200);
    expect(gaps.length).toBe(0);
  });

  it("detects missing reserves", () => {
    const gaps = detectCoverageGaps([], mockPricePoints, 100, 200);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0].reason).toBe("missing_reserves");
  });

  it("detects missing prices", () => {
    const gaps = detectCoverageGaps(mockReserveSnapshots, [], 100, 200);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0].reason).toBe("missing_prices");
  });
});
