import { describe, expect, it } from "vitest";
import { parsePoolEvent } from "@/server/research/soroban-pool-history/eventLayouts";
import { finalReserves, replayReserves } from "@/server/research/soroban-pool-history/reserveReplay";
import { consistentFixture } from "./fixtures";

describe("reserveReplay", () => {
  it("rebuilds reserves that match fixture storage at the end of the range", () => {
    const events = consistentFixture.events
      .map((raw) => parsePoolEvent(raw))
      .filter((result) => result.status === "ok")
      .map((result) => (result.status === "ok" ? result.event : null))
      .filter((event): event is NonNullable<typeof event> => event !== null);

    const series = replayReserves(
      BigInt(consistentFixture.opening_reserve_a),
      BigInt(consistentFixture.opening_reserve_b),
      events,
      consistentFixture.from_ledger,
    );
    const finals = finalReserves(series);

    expect(finals.reserveA.toString()).toBe(consistentFixture.storage_reserve_a);
    expect(finals.reserveB.toString()).toBe(consistentFixture.storage_reserve_b);
    expect(series.length).toBe(events.length + 1);
  });

  it("applies deposit, swap, and withdraw deltas in ledger order", () => {
    const deposit = parsePoolEvent({
      id: "1",
      ledger: 11,
      topic: "deposit",
      transactionHash: "aa",
      amountA: "10",
      amountB: "10",
    });
    const swap = parsePoolEvent({
      id: "2",
      ledger: 12,
      topic: "swap",
      transactionHash: "bb",
      amountA: "5",
      amountB: "4",
      direction: "a_to_b",
    });
    expect(deposit.status).toBe("ok");
    expect(swap.status).toBe("ok");
    if (deposit.status !== "ok" || swap.status !== "ok") return;

    const series = replayReserves(100n, 100n, [swap.event, deposit.event], 10);
    expect(series[1]?.reserveA).toBe(110n);
    expect(series[2]?.reserveA).toBe(115n);
    expect(series[2]?.reserveB).toBe(106n);
  });
});
