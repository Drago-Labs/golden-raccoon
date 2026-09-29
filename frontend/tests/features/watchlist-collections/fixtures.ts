/**
 * Fixtures and the shared harness for watchlist collections.
 *
 * The harness is deliberately repository-agnostic: the same builder produces
 * dependencies over the memory repository and over the PostgreSQL one, so the
 * conformance suite runs one set of cases against both.
 */
import { createMemoryCollectionsRepository } from "@/server/research/watchlist-collections/memoryRepository";
import { createPostgresCollectionsRepository } from "@/server/research/watchlist-collections/postgresRepository";
import type { CollectionsDependencies } from "@/server/research/watchlist-collections/service";
import type { CollectionsRepository, } from "@/server/research/watchlist-collections/repository";
import type { OwnerScope } from "@/server/research/watchlist-collections/schema";
import { createFakePool } from "./fakePool";

export const WALLET_A = "0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa";
export const WALLET_B = "0xBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbb";

export const OWNER_A: OwnerScope = { walletAddress: WALLET_A, network: "ethereum" };
/** The same address on another network: a different owner. */
export const OWNER_A_BASE: OwnerScope = { walletAddress: WALLET_A, network: "base" };
export const OWNER_B: OwnerScope = { walletAddress: WALLET_B, network: "ethereum" };

export const ENTRY_ONE = "entry-1";
export const ENTRY_TWO = "entry-2";
export const ENTRY_THREE = "entry-3";

export type Harness = {
  deps: CollectionsDependencies;
  repository: CollectionsRepository;
  /** Replaces the set of live watchlist entries, e.g. to make one disappear. */
  setEntries: (ids: string[]) => void;
  tick: () => void;
};

/**
 * Builds a harness with a frozen, manually advanced clock and deterministic
 * ids, so the same sequence of commands always produces the same records.
 */
export function createHarness(repository: CollectionsRepository): Harness {
  let counter = 0;
  let clock = Date.parse("2026-03-01T12:00:00.000Z");
  let entries = [ENTRY_ONE, ENTRY_TWO, ENTRY_THREE];

  return {
    repository,
    setEntries: (ids) => {
      entries = ids;
    },
    tick: () => {
      clock += 1_000;
    },
    deps: {
      repository,
      now: () => new Date(clock).toISOString(),
      newId: (kind) => {
        counter += 1;
        return `${kind}-${counter}`;
      },
      listWatchlistEntryIds: () => entries,
    },
  };
}

export function memoryHarness(): Harness {
  return createHarness(createMemoryCollectionsRepository());
}

export function postgresHarness(): Harness & { pool: ReturnType<typeof createFakePool> } {
  const pool = createFakePool();

  return { ...createHarness(createPostgresCollectionsRepository(pool)), pool };
}

/** Both implementations, for the conformance suite. */
export const REPOSITORIES: Array<{ name: string; build: () => Harness }> = [
  { name: "memory", build: memoryHarness },
  { name: "postgres", build: postgresHarness },
];

export function collection(name: string, overrides: Record<string, unknown> = {}) {
  return { name, ...overrides };
}
