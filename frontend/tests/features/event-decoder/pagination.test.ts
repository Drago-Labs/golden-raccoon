import { describe, expect, it } from "vitest";
import { paginateAndDeduplicateEvents, type RawContractEvent } from "@/server/research/event-decoder";

describe("paginateAndDeduplicateEvents", () => {
  it("deduplicates overlapping page events by eventId and sorts by ledger", () => {
    const ev1: RawContractEvent = {
      eventId: "0900100-0001",
      ledger: 900100,
      txHash: "a".repeat(64),
      topics: [{ type: "symbol", value: "transfer" }],
      data: { type: "u64", value: "10" },
    };
    const ev2: RawContractEvent = {
      eventId: "0900090-0001",
      ledger: 900090,
      txHash: "b".repeat(64),
      topics: [{ type: "symbol", value: "transfer" }],
      data: { type: "u64", value: "5" },
    };
    const res = paginateAndDeduplicateEvents([[ev1], [ev1, ev2]]);
    expect(res.duplicatesRemoved).toBe(1);
    expect(res.events.map((e) => e.eventId)).toEqual(["0900090-0001", "0900100-0001"]);
  });
});
