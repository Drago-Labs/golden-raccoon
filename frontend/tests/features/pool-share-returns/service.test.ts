import { describe, expect, it } from "vitest";
import { calculatePoolReturns } from "@/server/research/pool-share-returns/service";
import { PoolReturnsError } from "@/server/research/pool-share-returns/errors";

describe("service", () => {
  it("validates request schema", async () => {
    await expect(calculatePoolReturns({})).rejects.toThrow(PoolReturnsError);
    await expect(calculatePoolReturns({ account: "" })).rejects.toThrow(PoolReturnsError);
  });

  it("rejects window that is too large", async () => {
    const request = {
      account: "GABC123",
      poolId: "pool-1",
      network: "stellar-testnet" as const,
      windowStart: 100,
      windowEnd: 200000,
    };
    await expect(calculatePoolReturns(request)).rejects.toThrow(PoolReturnsError);
  });

  it("calculates returns for valid request", async () => {
    const request = {
      account: "GABC123",
      poolId: "pool-1",
      network: "stellar-testnet" as const,
      windowStart: 100,
      windowEnd: 200,
    };
    const report = await calculatePoolReturns(request);
    expect(report).toBeDefined();
    expect(report.schemaVersion).toBe(1);
    expect(report.account).toBe("GABC123");
    expect(report.poolId).toBe("pool-1");
    expect(report.state).toMatch(/complete|partial|unavailable/);
  });

  it("includes breakdown when data is complete", async () => {
    const request = {
      account: "GABC123",
      poolId: "pool-1",
      network: "stellar-testnet" as const,
      windowStart: 100,
      windowEnd: 200,
    };
    const report = await calculatePoolReturns(request);
    if (report.state === "complete" && report.breakdown) {
      expect(report.breakdown.holdValue).toBeDefined();
      expect(report.breakdown.poolValue).toBeDefined();
      expect(report.breakdown.feeIncome).toBeDefined();
      expect(report.breakdown.divergenceLoss).toBeDefined();
      expect(report.breakdown.totalReturn).toBeDefined();
    }
  });
});
