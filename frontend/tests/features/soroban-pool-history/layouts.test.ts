import { describe, expect, it } from "vitest";
import { parsePoolEvent, supportedLayoutNames } from "@/server/research/soroban-pool-history/eventLayouts";
import { unknownLayoutFixture } from "./fixtures";

describe("eventLayouts", () => {
  it("parses supported swap, deposit, withdraw, and sync layouts", () => {
    expect(supportedLayoutNames()).toEqual(["swap", "deposit", "withdraw", "sync"]);

    const swap = parsePoolEvent({
      id: "s1",
      ledger: 1,
      topic: "swap",
      transactionHash: "tx",
      amountA: "10",
      amountB: "9",
      direction: "b_to_a",
    });
    expect(swap.status).toBe("ok");
    if (swap.status === "ok") {
      expect(swap.event.kind).toBe("swap");
      expect(swap.event.direction).toBe("b_to_a");
    }

    const sync = parsePoolEvent({
      id: "sy",
      ledger: 2,
      topic: "sync",
      transactionHash: "tx",
      reserveA: "100",
      reserveB: "200",
    });
    expect(sync.status).toBe("ok");
  });

  it("marks unknown event layouts as unsupported", () => {
    const raw = unknownLayoutFixture.events[0];
    expect(raw).toBeDefined();
    const result = parsePoolEvent(raw!);
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") {
      expect(result.topic).toBe("mystery_fee");
    }
  });

  it("rejects malformed supported topics as unsupported", () => {
    const result = parsePoolEvent({
      id: "bad",
      ledger: 3,
      topic: "deposit",
      transactionHash: "tx",
    });
    expect(result.status).toBe("unsupported");
  });
});
