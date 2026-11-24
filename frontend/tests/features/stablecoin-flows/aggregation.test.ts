import { describe, expect, it } from "vitest";
import { aggregateDaily } from "@/server/research/stablecoin-flows/dailyAggregation";
import { StablecoinFlowError } from "@/server/research/stablecoin-flows/errors";
import { netIssuance, netIssuanceByChain } from "@/server/research/stablecoin-flows/netIssuance";
import type { FlowEvent } from "@/server/research/stablecoin-flows/schema";
import {
  dayOf,
  daysInWindow,
  deriveBlockRange,
  resolveWindow,
  withinWindow,
} from "@/server/research/stablecoin-flows/windowing";
import { window_ } from "./fixtures";

/** The recorded fixture's flows, stated directly so the arithmetic is readable. */
function event(chain: string, direction: "mint" | "burn", amount: string, at: string, txId: string): FlowEvent {
  const units = BigInt(amount) * 10_000_000n;
  return {
    chain,
    direction,
    amountUnits: units.toString(),
    amount,
    at,
    day: at.slice(0, 10),
    txId,
    txUrl: `https://example.invalid/tx/${txId}`,
    source: "fixture",
  };
}

const events = [
  event("ethereum", "mint", "1000000", "2026-11-18T06:00:00.000Z", "0xa"),
  event("ethereum", "burn", "250000", "2026-11-18T18:00:00.000Z", "0xb"),
  event("ethereum", "burn", "400000", "2026-11-19T12:00:00.000Z", "0xc"),
  event("stellar", "mint", "50000", "2026-11-18T09:00:00.000Z", "0xd"),
  event("stellar", "mint", "10000", "2026-11-19T21:00:00.000Z", "0xe"),
];

describe("resolveWindow", () => {
  it("states the window and its length in whole UTC days", () => {
    const resolved = resolveWindow("2026-11-18T00:00:00.000Z", "2026-11-20T00:00:00.000Z");
    expect([resolved.start, resolved.end, resolved.days]).toEqual([
      "2026-11-18T00:00:00.000Z",
      "2026-11-20T00:00:00.000Z",
      2,
    ]);
  });

  it("refuses a reversed window and one longer than the documented bound", () => {
    expect(() => resolveWindow("2026-11-20T00:00:00.000Z", "2026-11-18T00:00:00.000Z")).toThrowError(
      StablecoinFlowError,
    );
    expect(() => resolveWindow("2026-01-01T00:00:00.000Z", "2026-11-20T00:00:00.000Z")).toThrowError(/at most 90 days/);
  });

  it("decides membership by the chain's own timestamp", () => {
    const window = window_();
    expect(withinWindow("2026-11-18T00:00:00.000Z", window)).toBe(true);
    expect(withinWindow("2026-11-20T00:00:00.000Z", window)).toBe(true);
    expect(withinWindow("2026-11-17T23:59:59.000Z", window)).toBe(false);
    expect(withinWindow("not-a-time", window)).toBe(false);
  });

  it("names the UTC day of an instant and every day the window touches", () => {
    expect(dayOf("2026-11-18T23:59:59.000Z")).toBe("2026-11-18");
    expect(() => dayOf("nope")).toThrowError(/usable timestamp/);
    expect(daysInWindow(window_())).toEqual(["2026-11-18", "2026-11-19", "2026-11-20"]);
  });
});

describe("deriveBlockRange", () => {
  const window = window_();

  it("derives the range from the chain's nominal block time", () => {
    const range = deriveBlockRange(23_000_000, "2026-11-20T00:00:00.000Z", 12, window);
    // Two days at twelve seconds per block is 14,400 blocks.
    expect(range).toEqual({ fromBlock: 22_985_600, toBlock: 23_000_000, coversWindowStart: true });
  });

  it("reports a chain younger than the window as not covering its start", () => {
    const range = deriveBlockRange(12_000, "2026-11-20T00:00:00.000Z", 2, window);
    expect(range.fromBlock).toBe(0);
    expect(range.coversWindowStart).toBe(false);
  });

  it("clamps a range longer than the reader may page through", () => {
    const range = deriveBlockRange(10_000_000, "2026-11-20T00:00:00.000Z", 0.2, window);
    expect(range.toBlock - range.fromBlock + 1).toBe(500_000);
    expect(range.coversWindowStart).toBe(false);
  });

  it("refuses a provider that reports no usable head", () => {
    expect(() => deriveBlockRange(-1, "2026-11-20T00:00:00.000Z", 12, window)).toThrowError(/usable latest block/);
    expect(() => deriveBlockRange(10, "not-a-time", 12, window)).toThrowError(/usable latest block time/);
  });
});

describe("aggregateDaily", () => {
  const daily = aggregateDaily(events, ["ethereum", "stellar"], window_(), 7);

  it("totals the recorded fixture per UTC day and chain", () => {
    expect(daily.map((row) => [row.day, row.chain, row.mint, row.burn, row.net, row.eventCount])).toEqual([
      ["2026-11-18", "ethereum", "1000000", "250000", "750000", 2],
      ["2026-11-18", "stellar", "50000", "0", "50000", 1],
      ["2026-11-19", "ethereum", "0", "400000", "-400000", 1],
      ["2026-11-19", "stellar", "10000", "0", "10000", 1],
      ["2026-11-20", "ethereum", "0", "0", "0", 0],
      ["2026-11-20", "stellar", "0", "0", "0", 0],
    ]);
  });

  it("keeps a row for a day with no flow rather than leaving a gap", () => {
    expect(daily.filter((row) => row.day === "2026-11-20").every((row) => row.eventCount === 0)).toBe(true);
  });

  it("aggregates in exact integer units", () => {
    const row = daily.find((candidate) => candidate.day === "2026-11-18" && candidate.chain === "ethereum")!;
    expect([row.mintUnits, row.burnUnits, row.netUnits]).toEqual(["10000000000000", "2500000000000", "7500000000000"]);
  });
});

describe("netIssuance", () => {
  const daily = aggregateDaily(events, ["ethereum", "stellar"], window_(), 7);

  it("matches the hand calculation across the window", () => {
    // Minted 1,000,000 + 50,000 + 10,000; burned 250,000 + 400,000; net 410,000.
    expect(netIssuance(daily, 7)).toEqual({
      mintUnits: "10600000000000",
      burnUnits: "6500000000000",
      netUnits: "4100000000000",
      mint: "1060000",
      burn: "650000",
      net: "410000",
      eventCount: 5,
    });
  });

  it("keeps each chain's own figure so one does not hide the other", () => {
    expect(netIssuanceByChain(daily, 7).map((row) => [row.chain, row.mint, row.burn, row.net])).toEqual([
      ["ethereum", "1000000", "650000", "350000"],
      ["stellar", "60000", "0", "60000"],
    ]);
  });

  it("states zero rather than nothing when a window has no flow", () => {
    const empty = aggregateDaily([], ["ethereum"], window_(), 7);
    expect(netIssuance(empty, 7)).toMatchObject({ mint: "0", burn: "0", net: "0", eventCount: 0 });
  });
});
