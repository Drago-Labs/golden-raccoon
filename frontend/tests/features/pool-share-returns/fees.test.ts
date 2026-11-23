import { describe, expect, it } from "vitest";
import { calculateFeeIncome } from "@/server/research/pool-share-returns/feeIncome";
import { mockReserveSnapshots } from "./fixtures";

describe("feeIncome", () => {
  it("calculates fee income from reserve growth", () => {
    const feeIncome = calculateFeeIncome(mockReserveSnapshots, "100000000");
    expect(feeIncome).toBeDefined();
    expect(Number(feeIncome)).toBeGreaterThanOrEqual(0);
  });

  it("returns zero for insufficient snapshots", () => {
    const feeIncome = calculateFeeIncome([], "100000000");
    expect(feeIncome).toBe("0");
  });

  it("returns zero for single snapshot", () => {
    const feeIncome = calculateFeeIncome([mockReserveSnapshots[0]], "100000000");
    expect(feeIncome).toBe("0");
  });
});
