import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { InvocationReadResult, InvocationReader } from "@/server/research/invocation-profile";
import type { CoverageGap, RawInvocation } from "@/server/research/invocation-profile/schema";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "data");

export const CONTRACT = "CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR";
export const ADMIN = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const USER_A = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
export const USER_B = "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";
export const ROUTER = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4";

type AvailableFixture = {
  status: "available";
  invocations: RawInvocation[];
  priorCallerDays: Record<string, string[]>;
  coverageGaps: CoverageGap[];
};

function loadJson(name: string): unknown {
  return JSON.parse(readFileSync(join(dataDir, name), "utf8"));
}

function asAvailable(raw: {
  invocations: RawInvocation[];
  priorCallerDays?: Record<string, string[]>;
  coverageGaps?: CoverageGap[];
}): AvailableFixture {
  return {
    status: "available",
    invocations: raw.invocations,
    priorCallerDays: raw.priorCallerDays ?? {},
    coverageGaps: raw.coverageGaps ?? [],
  };
}

export function loadBusyContract(): AvailableFixture {
  return asAvailable(loadJson("busy-contract.json") as AvailableFixture);
}

export function loadAdminOnlyContract(): AvailableFixture {
  return asAvailable(loadJson("admin-only-contract.json") as AvailableFixture);
}

export function loadNestedCalls(): AvailableFixture {
  return asAvailable(loadJson("nested-calls.json") as AvailableFixture);
}

export function loadProviderUnavailable(): { status: "unavailable"; reason: string } {
  const raw = loadJson("provider-unavailable.json") as { status: "unavailable"; reason: string };
  return { status: "unavailable", reason: raw.reason };
}

export function readerFromFixture(fixture: InvocationReadResult | AvailableFixture): InvocationReader {
  return async () => {
    if (fixture.status === "unavailable") return fixture;
    return {
      status: "available",
      invocations: fixture.invocations,
      priorCallerDays: fixture.priorCallerDays,
      coverageGaps: fixture.coverageGaps,
      truncated: false,
    };
  };
}

export const baseRequest = {
  contractId: CONTRACT,
  network: "stellar-testnet" as const,
  windowStart: 1000,
  windowEnd: 2000,
};
