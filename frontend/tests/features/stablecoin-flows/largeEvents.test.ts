import { describe, expect, it } from "vitest";
import { largestEvents } from "@/server/research/stablecoin-flows/largeEvents";
import { STABLECOIN_FLOW_LIMITS } from "@/server/research/stablecoin-flows/limits";
import type { FlowEvent } from "@/server/research/stablecoin-flows/schema";

function event(chain: string, amount: string, at: string, txId: string, direction: "mint" | "burn" = "mint"): FlowEvent {
  return {
    chain,
    direction,
    amountUnits: (BigInt(amount) * 10_000_000n).toString(),
    amount,
    at,
    day: at.slice(0, 10),
    txId,
    txUrl: `https://etherscan.io/tx/${txId}`,
    source: "fixture",
  };
}

const events = [
  event("ethereum", "1000000", "2026-11-18T06:00:00.000Z", "0xa"),
  event("ethereum", "250000", "2026-11-18T18:00:00.000Z", "0xb", "burn"),
  event("ethereum", "400000", "2026-11-19T12:00:00.000Z", "0xc", "burn"),
  event("stellar", "50000", "2026-11-18T09:00:00.000Z", "0xd"),
  event("stellar", "10000", "2026-11-19T21:00:00.000Z", "0xe"),
];

describe("largestEvents", () => {
  it("ranks by amount regardless of direction or chain", () => {
    expect(largestEvents(events, 5).map((item) => [item.chain, item.direction, item.amount])).toEqual([
      ["ethereum", "mint", "1000000"],
      ["ethereum", "burn", "400000"],
      ["ethereum", "burn", "250000"],
      ["stellar", "mint", "50000"],
      ["stellar", "mint", "10000"],
    ]);
  });

  it("keeps the transaction each event came from so it can be opened", () => {
    const [largest] = largestEvents(events, 1);
    expect(largest.txId).toBe("0xa");
    expect(largest.txUrl).toBe("https://etherscan.io/tx/0xa");
  });

  it("returns only the requested count", () => {
    expect(largestEvents(events, 2)).toHaveLength(2);
    expect(largestEvents(events, 99)).toHaveLength(events.length);
  });

  it("never exceeds the documented ranking bound or returns nothing for a bad count", () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      event("ethereum", String(index + 1), "2026-11-18T06:00:00.000Z", `0x${index}`),
    );
    expect(largestEvents(many, 999)).toHaveLength(STABLECOIN_FLOW_LIMITS.maxRankedEvents);
    expect(largestEvents(many, 0)).toHaveLength(1);
  });

  it("breaks ties by time, chain and transaction rather than provider order", () => {
    const tied = [
      event("stellar", "1000", "2026-11-18T06:00:00.000Z", "0x2"),
      event("ethereum", "1000", "2026-11-18T06:00:00.000Z", "0x1"),
      event("ethereum", "1000", "2026-11-19T06:00:00.000Z", "0x3"),
    ];
    expect(largestEvents(tied, 3).map((item) => item.txId)).toEqual(["0x3", "0x1", "0x2"]);
    expect(largestEvents([...tied].reverse(), 3).map((item) => item.txId)).toEqual(["0x3", "0x1", "0x2"]);
  });

  it("leaves the caller's list untouched", () => {
    const order = events.map((item) => item.txId);
    largestEvents(events, 3);
    expect(events.map((item) => item.txId)).toEqual(order);
  });
});
