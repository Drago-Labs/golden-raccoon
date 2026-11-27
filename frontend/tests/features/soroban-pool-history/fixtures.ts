import type { RawPoolEvent } from "@/server/research/soroban-pool-history/eventLayouts";
import type { PoolHistoryDeps } from "@/server/research/soroban-pool-history/service";
import consistentPool from "./data/consistent-pool.json";
import driftedPool from "./data/drifted-pool.json";
import providerUnavailable from "./data/provider-unavailable.json";
import unknownLayout from "./data/unknown-layout.json";

export type FixtureFile = {
  from_ledger: number;
  to_ledger: number;
  pool_id: string;
  opening_reserve_a: string;
  opening_reserve_b: string;
  storage_reserve_a: string | null;
  storage_reserve_b: string | null;
  truncated: boolean;
  events: RawPoolEvent[];
};

export const consistentFixture = consistentPool as FixtureFile;
export const driftedFixture = driftedPool as FixtureFile;
export const unknownLayoutFixture = unknownLayout as FixtureFile;
export const unavailableFixture = providerUnavailable as {
  error: string;
  reason: string;
  pool_id: string;
};

export function depsFor(fixture: FixtureFile, truncated = fixture.truncated): PoolHistoryDeps {
  return {
    readEvents: async (_network, poolId) => {
      if (poolId !== fixture.pool_id) return { status: "missing" };
      const ledgers = fixture.events.map((event) => event.ledger);
      return {
        status: "ok",
        value: {
          events: fixture.events,
          openingReserveA: BigInt(fixture.opening_reserve_a),
          openingReserveB: BigInt(fixture.opening_reserve_b),
          storageReserveA: fixture.storage_reserve_a == null ? null : BigInt(fixture.storage_reserve_a),
          storageReserveB: fixture.storage_reserve_b == null ? null : BigInt(fixture.storage_reserve_b),
          truncated,
          oldestLedger: ledgers.length === 0 ? fixture.from_ledger : Math.min(...ledgers),
        },
      };
    },
  };
}

export function unavailableDeps(): PoolHistoryDeps {
  return { readEvents: async () => ({ status: "unavailable", reason: unavailableFixture.reason }) };
}

export function requestFor(fixture: Pick<FixtureFile, "pool_id" | "from_ledger" | "to_ledger">) {
  return {
    poolId: fixture.pool_id,
    network: "stellar-testnet" as const,
    fromLedger: fixture.from_ledger,
    toLedger: fixture.to_ledger,
  };
}
