import { describe, expect, it } from "vitest";
import { parsePoolEvent } from "@/server/research/soroban-pool-history/eventLayouts";
import { rankLargeTrades } from "@/server/research/soroban-pool-history/largeTrades";
import { replayReserves } from "@/server/research/soroban-pool-history/reserveReplay";
import { consistentFixture } from "./fixtures";

describe("largeTrades", () => {
  it("ranks price-moving trades and includes transaction hashes", () => {
    const events = consistentFixture.events
      .map((raw) => parsePoolEvent(raw))
      .filter((result): result is { status: "ok"; event: import("@/server/research/soroban-pool-history/eventLayouts").ParsedPoolEvent } => result.status === "ok")
      .map((result) => result.event);

    const series = replayReserves(
      BigInt(consistentFixture.opening_reserve_a),
      BigInt(consistentFixture.opening_reserve_b),
      events,
      consistentFixture.from_ledger,
    );
    const trades = rankLargeTrades(events, series);

    expect(trades.length).toBeGreaterThan(0);
    expect(trades.every((trade) => trade.transactionHash.length > 0)).toBe(true);
    expect(trades[0]?.transactionHash).toMatch(/^[a-f0-9]+$/i);

    const moves = trades.map((trade) => BigInt(trade.priceMoveBps));
    for (let index = 1; index < moves.length; index += 1) {
      expect(moves[index]! <= moves[index - 1]!).toBe(true);
    }
  });
});
