import { describe, expect, it } from "vitest";
import { coverageNotice } from "@/server/research/soroban-pool-history/coverage";
import { PoolHistoryError } from "@/server/research/soroban-pool-history/errors";
import { POOL_HISTORY_LIMITS } from "@/server/research/soroban-pool-history/limits";
import { reconstructPoolHistory } from "@/server/research/soroban-pool-history";
import { poolHistoryRequestSchema } from "@/server/research/soroban-pool-history/schema";
import {
  consistentFixture,
  depsFor,
  driftedFixture,
  requestFor,
  unavailableDeps,
  unknownLayoutFixture,
} from "./fixtures";

describe("reconstructPoolHistory", () => {
  it("matches fixture storage for a consistent pool", async () => {
    const report = await reconstructPoolHistory(requestFor(consistentFixture), depsFor(consistentFixture));
    expect(report.state).toBe("complete");
    expect(report.drift?.matched).toBe(true);
    expect(report.reserves.at(-1)?.reserveA).toBe(consistentFixture.storage_reserve_a);
    expect(report.reserves.at(-1)?.reserveB).toBe(consistentFixture.storage_reserve_b);
    expect(report.largeTrades[0]?.transactionHash).toBeTruthy();
    expect(report.coverageNotice).toBe(coverageNotice("complete", [], false));
    expect(report.readOnly).toBe(true);
  });

  it("reports drift instead of a match for a drifted pool", async () => {
    const report = await reconstructPoolHistory(requestFor(driftedFixture), depsFor(driftedFixture));
    expect(report.state).toBe("partial");
    expect(report.drift?.matched).toBe(false);
    expect(report.driftNotice).toMatch(/drift/i);
  });

  it("returns an unsupported state for unknown layouts", async () => {
    const report = await reconstructPoolHistory(requestFor(unknownLayoutFixture), depsFor(unknownLayoutFixture));
    expect(report.state).toBe("unsupported");
    expect(report.unsupportedLayouts).toContain("mystery_fee");
    expect(report.reserves).toEqual([]);
  });

  it("returns unavailable without inventing reserves", async () => {
    const report = await reconstructPoolHistory(requestFor(consistentFixture), unavailableDeps());
    expect(report.state).toBe("unavailable");
    expect(report.reserves).toEqual([]);
    expect(report.drift).toBeNull();
  });

  it("marks truncated history as partial", async () => {
    const report = await reconstructPoolHistory(requestFor(consistentFixture), depsFor(consistentFixture, true));
    expect(report.state).toBe("partial");
    expect(report.historyTruncated).toBe(true);
  });

  it("rejects invalid requests and wide windows", async () => {
    await expect(reconstructPoolHistory({})).rejects.toBeInstanceOf(PoolHistoryError);
    expect(
      poolHistoryRequestSchema.safeParse({
        poolId: consistentFixture.pool_id,
        network: "stellar-testnet",
        fromLedger: 5,
        toLedger: 1,
      }).success,
    ).toBe(false);
    expect(POOL_HISTORY_LIMITS.maxEvents).toBeGreaterThan(0);
  });
});
