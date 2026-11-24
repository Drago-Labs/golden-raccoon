import { describe, expect, it } from "vitest";
import { CounterpartyFlowsError } from "@/server/research/counterparty-flows/errors";
import { profileCounterparties } from "@/server/research/counterparty-flows/service";
import {
  depsFor,
  diverseFlows,
  exchangeHeavy,
  inactiveAccount,
  providerUnavailable,
  requestFor,
} from "./fixtures";

describe("service", () => {
  it("rejects invalid requests", async () => {
    await expect(profileCounterparties({})).rejects.toThrow(CounterpartyFlowsError);
  });

  it("profiles exchange-heavy fixture with labelled totals and concentration", async () => {
    const report = await profileCounterparties(requestFor(exchangeHeavy), depsFor(exchangeHeavy));
    expect(report.state).toBe("complete");
    expect(report.eventCount).toBe(3);
    expect(report.readOnly).toBe(true);

    const exchangeOut = report.totals.find(
      (row) =>
        row.direction === "out" &&
        row.counterparty === "GBB47USUTI3NCW7227HZCKPYA2B4ZJ5TDQJY6Y4EVLKI33O57IPOANDJ",
    );
    expect(exchangeOut?.amount).toBe("80.0000000");
    expect(exchangeOut?.label).toBe("Exchange Desk");

    const outNative = report.concentration.find((slice) => slice.direction === "out" && slice.asset === "native");
    expect(outNative?.herfindahl).toEqual({ numerator: "17", denominator: "25" });
    expect(outNative?.topShares.find((share) => share.n === 1)?.share).toEqual({
      numerator: "4",
      denominator: "5",
    });
  });

  it("keeps diverse counterparties unlabelled", async () => {
    const report = await profileCounterparties(requestFor(diverseFlows), depsFor(diverseFlows));
    expect(report.totals.every((row) => row.label === null)).toBe(true);
    expect(report.eventCount).toBe(5);
  });

  it("returns an empty complete profile for an inactive account", async () => {
    const report = await profileCounterparties(requestFor(inactiveAccount), depsFor(inactiveAccount));
    expect(report.state).toBe("complete");
    expect(report.totals).toEqual([]);
    expect(report.eventCount).toBe(0);
  });

  it("returns unavailable when every reader fails", async () => {
    const report = await profileCounterparties(requestFor(providerUnavailable), depsFor(providerUnavailable));
    expect(report.state).toBe("unavailable");
    expect(report.coverageNotice).toMatch(/unavailable/i);
  });
});
