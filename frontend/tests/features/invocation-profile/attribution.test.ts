import { describe, expect, it } from "vitest";
import { attributeCallers } from "@/server/research/invocation-profile/callerAttribution";
import { loadNestedCalls, ROUTER, USER_A, USER_B, ADMIN } from "./fixtures";

describe("callerAttribution", () => {
  it("attributes nested calls to originating account and intermediary", () => {
    const attributed = attributeCallers(loadNestedCalls().invocations);

    const nested = attributed.filter((row) => row.callerKind === "via_contract");
    expect(nested).toHaveLength(3);

    const swap = nested.filter((row) => row.functionName === "swap");
    expect(swap.every((row) => row.originatingAccount === USER_A)).toBe(true);
    expect(swap.every((row) => row.intermediary === ROUTER)).toBe(true);

    const deposit = nested.find((row) => row.functionName === "deposit");
    expect(deposit?.originatingAccount).toBe(USER_B);
    expect(deposit?.intermediary).toBe("CBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHBQ");
  });

  it("keeps direct account callers without an intermediary", () => {
    const attributed = attributeCallers(loadNestedCalls().invocations);
    const direct = attributed.find((row) => row.originatingAccount === ADMIN);
    expect(direct?.callerKind).toBe("direct_account");
    expect(direct?.intermediary).toBeNull();
  });
});
