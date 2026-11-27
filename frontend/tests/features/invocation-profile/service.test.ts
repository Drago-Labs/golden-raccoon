import { describe, expect, it } from "vitest";
import { InvocationProfileError } from "@/server/research/invocation-profile/errors";
import { profileInvocations } from "@/server/research/invocation-profile/service";
import {
  ADMIN,
  baseRequest,
  loadAdminOnlyContract,
  loadBusyContract,
  loadNestedCalls,
  loadProviderUnavailable,
  readerFromFixture,
  ROUTER,
  USER_A,
} from "./fixtures";

describe("service", () => {
  it("validates request schema", async () => {
    await expect(profileInvocations({})).rejects.toThrow(InvocationProfileError);
    await expect(profileInvocations({ contractId: "not-a-contract", network: "stellar-testnet", windowStart: 1, windowEnd: 2 })).rejects.toThrow(
      InvocationProfileError,
    );
  });

  it("rejects a window that is too large", async () => {
    await expect(
      profileInvocations({
        ...baseRequest,
        windowStart: 1,
        windowEnd: 200_000,
      }),
    ).rejects.toThrow(InvocationProfileError);
  });

  it("profiles a busy contract with matching function counts", async () => {
    const report = await profileInvocations(baseRequest, {
      readInvocations: readerFromFixture(loadBusyContract()),
    });

    expect(report.state).toBe("complete");
    expect(report.sampledInvocationCount).toBe(6);
    const transfer = report.functions.find((row) => row.functionName === "transfer");
    expect(transfer?.successCount).toBe(3);
    expect(transfer?.failureCount).toBe(1);
    expect(report.cohorts.returningCallers).toBe(1);
  });

  it("attributes nested calls to origin and intermediary", async () => {
    const report = await profileInvocations(baseRequest, {
      readInvocations: readerFromFixture(loadNestedCalls()),
    });

    const swapCaller = report.callers.find((row) => row.account === USER_A);
    expect(swapCaller?.viaContractCount).toBe(2);
    expect(swapCaller?.intermediaries).toContain(ROUTER);
    expect(swapCaller?.failureCount).toBe(1);
  });

  it("shows admin-only concentration", async () => {
    const report = await profileInvocations(baseRequest, {
      readInvocations: readerFromFixture(loadAdminOnlyContract()),
    });
    expect(report.concentration.topCallerAccount).toBe(ADMIN);
    expect(report.concentration.topCallerShare).toBe(1);
  });

  it("returns unavailable when the provider fails", async () => {
    const report = await profileInvocations(baseRequest, {
      readInvocations: readerFromFixture(loadProviderUnavailable()),
    });
    expect(report.state).toBe("unavailable");
    expect(report.functions).toEqual([]);
  });
});
