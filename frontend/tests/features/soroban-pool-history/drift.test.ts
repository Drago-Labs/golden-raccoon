import { describe, expect, it } from "vitest";
import { parsePoolEvent } from "@/server/research/soroban-pool-history/eventLayouts";
import { finalReserves, replayReserves } from "@/server/research/soroban-pool-history/reserveReplay";
import { checkStorageDrift } from "@/server/research/soroban-pool-history/storageCheck";
import { driftedFixture } from "./fixtures";

describe("storageCheck", () => {
  it("reports drift when rebuilt reserves disagree with storage", () => {
    const events = driftedFixture.events
      .map((raw) => parsePoolEvent(raw))
      .filter((result): result is { status: "ok"; event: import("@/server/research/soroban-pool-history/eventLayouts").ParsedPoolEvent } => result.status === "ok")
      .map((result) => result.event);

    const series = replayReserves(
      BigInt(driftedFixture.opening_reserve_a),
      BigInt(driftedFixture.opening_reserve_b),
      events,
      driftedFixture.from_ledger,
    );
    const finals = finalReserves(series);
    const drift = checkStorageDrift(
      finals.reserveA,
      finals.reserveB,
      BigInt(driftedFixture.storage_reserve_a!),
      BigInt(driftedFixture.storage_reserve_b!),
    );

    expect(finals.reserveA).toBe(1050000000n);
    expect(finals.reserveB).toBe(950000000n);
    expect(drift.matched).toBe(false);
    expect(drift.deltaA).toBe("-150000000");
    expect(drift.deltaB).toBe("150000000");
  });

  it("matches when storage equals rebuilt reserves", () => {
    const drift = checkStorageDrift(100n, 200n, 100n, 200n);
    expect(drift.matched).toBe(true);
    expect(drift.deltaA).toBe("0");
    expect(drift.deltaB).toBe("0");
  });

  it("reports unmatched when storage is missing", () => {
    const drift = checkStorageDrift(100n, 200n, null, null);
    expect(drift.matched).toBe(false);
    expect(drift.deltaA).toBeNull();
  });
});
