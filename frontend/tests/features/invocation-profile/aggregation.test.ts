import { describe, expect, it } from "vitest";
import { attributeCallers } from "@/server/research/invocation-profile/callerAttribution";
import { aggregateByFunction } from "@/server/research/invocation-profile/functionAggregation";
import { buildDailySeries } from "@/server/research/invocation-profile/dailySeries";
import { loadBusyContract, loadAdminOnlyContract } from "./fixtures";

describe("functionAggregation", () => {
  it("matches fixture function success and failure counts", () => {
    const attributed = attributeCallers(loadBusyContract().invocations);
    const functions = aggregateByFunction(attributed);

    const transfer = functions.find((row) => row.functionName === "transfer");
    expect(transfer).toEqual(
      expect.objectContaining({
        functionName: "transfer",
        successCount: 3,
        failureCount: 1,
        uniqueCallers: 4,
      }),
    );

    const approve = functions.find((row) => row.functionName === "approve");
    expect(approve?.successCount).toBe(1);
    expect(approve?.failureCount).toBe(0);
  });

  it("counts failed admin upgrades separately", () => {
    const attributed = attributeCallers(loadAdminOnlyContract().invocations);
    const functions = aggregateByFunction(attributed);
    const upgrade = functions.find((row) => row.functionName === "upgrade");
    expect(upgrade?.successCount).toBe(0);
    expect(upgrade?.failureCount).toBe(1);
  });
});

describe("dailySeries", () => {
  it("builds day buckets with unique callers", () => {
    const attributed = attributeCallers(loadBusyContract().invocations);
    const daily = buildDailySeries(attributed);
    expect(daily.map((point) => point.day)).toEqual(["2024-02-01", "2024-02-02", "2024-02-03"]);
    expect(daily[0].uniqueCallers).toBe(2);
  });
});
