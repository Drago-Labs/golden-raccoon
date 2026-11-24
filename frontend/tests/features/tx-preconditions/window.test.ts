import { describe, expect, it } from "vitest";
import { computeValidityWindow } from "@/server/research/tx-preconditions/validityWindow";

describe("validityWindow", () => {
  it("takes the max of earliest constraints and the min of latest constraints", () => {
    const window = computeValidityWindow({
      timeEarliestUnix: 1_000,
      timeLatestUnix: 5_000,
      ledgerEarliest: 10,
      ledgerLatest: 50,
      sequenceEarliestUnix: 2_000,
      sequenceEarliestLedger: 20,
      currentlySatisfied: true,
      invalidReasons: [],
    });

    expect(window.earliestSubmitAt).toBe(new Date(2_000_000).toISOString());
    expect(window.latestSubmitAt).toBe(new Date(5_000_000).toISOString());
    expect(window.earliestLedger).toBe(20);
    expect(window.latestLedger).toBe(50);
    expect(window.currentlyValid).toBe(true);
  });

  it("surfaces invalid reasons even when bounds are unbounded", () => {
    const window = computeValidityWindow({
      timeEarliestUnix: null,
      timeLatestUnix: null,
      ledgerEarliest: null,
      ledgerLatest: null,
      sequenceEarliestUnix: null,
      sequenceEarliestLedger: null,
      currentlySatisfied: false,
      invalidReasons: ["sequence too low"],
    });

    expect(window.currentlyValid).toBe(false);
    expect(window.invalidReasons).toEqual(["sequence too low"]);
  });
});
