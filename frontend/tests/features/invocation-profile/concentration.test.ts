import { describe, expect, it } from "vitest";
import { attributeCallers } from "@/server/research/invocation-profile/callerAttribution";
import { aggregateByCaller, computeCallerConcentration } from "@/server/research/invocation-profile/concentration";
import { ADMIN, loadAdminOnlyContract, loadBusyContract } from "./fixtures";

describe("concentration", () => {
  it("reports full concentration for an admin-only contract", () => {
    const attributed = attributeCallers(loadAdminOnlyContract().invocations);
    const metrics = computeCallerConcentration(attributed);

    expect(metrics.callerCount).toBe(1);
    expect(metrics.totalInvocations).toBe(4);
    expect(metrics.topCallerAccount).toBe(ADMIN);
    expect(metrics.topCallerShare).toBe(1);
    expect(metrics.herfindahl).toBe(1);
  });

  it("aggregates caller rows to match fixture totals", () => {
    const attributed = attributeCallers(loadBusyContract().invocations);
    const callers = aggregateByCaller(attributed);
    const transferCaller = callers.find((row) => row.account === ADMIN);
    expect(transferCaller?.successCount).toBe(2);
    expect(transferCaller?.failureCount).toBe(0);
    expect(transferCaller?.functionNames).toEqual(["mint", "transfer"]);
  });
});
