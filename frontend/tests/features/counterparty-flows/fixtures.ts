import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDirectoryResolver } from "@/server/research/counterparty-flows/counterpartyLabels";
import type { CounterpartyFlowDeps } from "@/server/research/counterparty-flows/service";
import type { FlowEvent } from "@/server/research/counterparty-flows/schema";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "data");

type FixtureFile = {
  account: string;
  network: "stellar-testnet" | "stellar-pubnet";
  windowStart: string;
  windowEnd: string;
  labels?: Record<string, { label: string; evidence: string }>;
  events: FlowEvent[];
  reason?: string;
};

function loadFixture(name: string): FixtureFile {
  return JSON.parse(readFileSync(join(dataDir, name), "utf8")) as FixtureFile;
}

export const exchangeHeavy = loadFixture("exchange-heavy.json");
export const diverseFlows = loadFixture("diverse-flows.json");
export const inactiveAccount = loadFixture("inactive-account.json");
export const providerUnavailable = loadFixture("provider-unavailable.json");

export function depsFor(fixture: FixtureFile): CounterpartyFlowDeps {
  const unavailable = Boolean(fixture.reason);
  const ok = {
    status: "ok" as const,
    events: fixture.events,
    truncated: false,
    reachedWindowStart: true,
  };
  const blocked = {
    status: "unavailable" as const,
    reason: fixture.reason ?? "provider unavailable",
  };

  return {
    readPayments: async () => (unavailable ? blocked : { ...ok, events: fixture.events.filter((event) => event.kind === "payment") }),
    readPathPayments: async () =>
      unavailable ? blocked : { ...ok, events: fixture.events.filter((event) => event.kind === "path_payment") },
    readClaims: async () => (unavailable ? blocked : { ...ok, events: fixture.events.filter((event) => event.kind === "claim") }),
    identityResolver: createDirectoryResolver(fixture.labels ?? {}),
    nowMs: () => Date.parse(fixture.windowEnd),
  };
}

export function requestFor(fixture: FixtureFile) {
  return {
    account: fixture.account,
    network: fixture.network,
    windowStart: fixture.windowStart,
    windowEnd: fixture.windowEnd,
  };
}
