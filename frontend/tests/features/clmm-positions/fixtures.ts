import type { PoolSnapshot } from "@/server/research/clmm-positions/poolState";
import type { RawPosition } from "@/server/research/clmm-positions/positionReader";
import type { ClmmPositionsDeps } from "@/server/research/clmm-positions/service";
import closedPosition from "./data/closed-position.json";
import inRange from "./data/in-range.json";
import outOfRange from "./data/out-of-range.json";
import providerUnavailable from "./data/provider-unavailable.json";

export type RecordedFixture = {
  label: string;
  address: string;
  network: string;
  position?: RawPosition;
  pool?: PoolSnapshot;
  reason?: string;
  expected: Record<string, unknown>;
};

export const ADDRESS = "0x1111111111111111111111111111111111111111";

export const inRangeFixture = inRange as RecordedFixture;
export const outOfRangeFixture = outOfRange as RecordedFixture;
export const closedFixture = closedPosition as RecordedFixture;
export const unavailableFixture = providerUnavailable as RecordedFixture;

export const recordedFixtures = [inRangeFixture, outOfRangeFixture, closedFixture, unavailableFixture];

export function depsFromFixture(fixture: RecordedFixture): ClmmPositionsDeps {
  if (!fixture.position || !fixture.pool) {
    return {
      readPositions: async () => ({ status: "unavailable", reason: fixture.reason ?? "unavailable" }),
      readPool: async () => ({ status: "unavailable", reason: fixture.reason ?? "unavailable" }),
    };
  }

  return {
    readPositions: async () => ({
      status: "available",
      positions: [fixture.position as RawPosition],
      nextCursor: null,
    }),
    readPool: async () => ({
      status: "available",
      pool: fixture.pool as PoolSnapshot,
    }),
  };
}

export function depsFromPositions(
  positions: RawPosition[],
  pools: Record<string, PoolSnapshot>,
): ClmmPositionsDeps {
  return {
    readPositions: async () => ({ status: "available", positions, nextCursor: null }),
    readPool: async ({ pool }) => {
      const snapshot = pools[pool];
      if (!snapshot) return { status: "unavailable", reason: `missing pool ${pool}` };
      return { status: "available", pool: snapshot };
    },
  };
}
