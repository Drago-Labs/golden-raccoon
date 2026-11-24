import { describe, expect, it } from "vitest";
import { attributeCallers } from "@/server/research/invocation-profile/callerAttribution";
import { computeCallerCohorts } from "@/server/research/invocation-profile/cohorts";
import { ADMIN, loadBusyContract, loadNestedCalls } from "./fixtures";

describe("cohorts", () => {
  it("marks prior callers as returning and others as new", () => {
    const fixture = loadBusyContract();
    const attributed = attributeCallers(fixture.invocations);
    const cohorts = computeCallerCohorts(attributed, fixture.priorCallerDays);

    expect(cohorts.returningCallerAccounts).toContain(ADMIN);
    expect(cohorts.returningCallers).toBe(1);
    expect(cohorts.newCallers).toBe(4);
    expect(cohorts.newCallerAccounts).not.toContain(ADMIN);
  });

  it("treats everyone as new when prior activity is empty", () => {
    const fixture = loadNestedCalls();
    const attributed = attributeCallers(fixture.invocations);
    const cohorts = computeCallerCohorts(attributed, fixture.priorCallerDays);
    expect(cohorts.returningCallers).toBe(0);
    expect(cohorts.newCallers).toBe(3);
  });
});
