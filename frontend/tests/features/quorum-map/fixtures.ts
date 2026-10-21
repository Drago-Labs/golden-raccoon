import type { QuorumDeps } from "@/server/research/quorum-map/service";
import type { ValidatorSnapshot } from "@/server/research/quorum-map/validatorSource";
import mainnetSnapshot from "./data/mainnet-snapshot.json";
import nestedQuorum from "./data/nested-quorum.json";
import providerUnavailable from "./data/provider-unavailable.json";
import tomlMismatch from "./data/toml-mismatch.json";

export const NOW = new Date("2026-10-21T12:00:00.000Z");

export type FixtureFile = {
  network: "stellar-testnet" | "stellar-pubnet";
  source: string;
  fetchedAt: string;
  nodes: Array<{ publicKey: string; organization: string; homeDomain: string; quorumSet: unknown }>;
  toml: Array<{ publicKey: string; homeDomain: string; source: string; fetchedAt: string }>;
};

export const mainnetFixture = mainnetSnapshot as FixtureFile;
export const nestedFixture = nestedQuorum as FixtureFile;
export const mismatchFixture = tomlMismatch as FixtureFile;
export const unavailableFixture = providerUnavailable as { error: string; reason: string };

export function snapshotFrom(fixture: FixtureFile): ValidatorSnapshot {
  return {
    directory: { name: fixture.source, fetchedAt: fixture.fetchedAt },
    nodes: fixture.nodes,
    toml: fixture.toml,
    tomlFailures: [],
  };
}

export function depsFor(fixture: FixtureFile): QuorumDeps {
  return { readSnapshot: async () => ({ status: "ok", value: snapshotFrom(fixture) }) };
}

export function unavailableDeps(): QuorumDeps {
  return { readSnapshot: async () => ({ status: "unavailable", reason: unavailableFixture.reason }) };
}
