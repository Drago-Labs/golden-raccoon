import { vi } from "vitest";
import { DelegateParticipationError } from "@/server/research/delegate-participation/errors";
import type { LogReader, RawLog } from "@/server/research/delegate-participation/delegationEvents";
import type { CodeReader } from "@/server/research/delegate-participation/voteReader";
import type { DelegateParticipationDeps } from "@/server/research/delegate-participation/service";
import activeDelegates from "./data/active-delegates.json";
import dormantDelegate from "./data/dormant-delegate.json";
import providerUnavailable from "./data/provider-unavailable.json";
import unsupportedGovernor from "./data/unsupported-governor.json";

export const fixtures = { activeDelegates, dormantDelegate, unsupportedGovernor, providerUnavailable };
export type FixtureName = keyof typeof fixtures;

export const TOKEN = "0x7a2e1e8b9c0d4f3a5b6c7d8e9f0a1b2c3d4e5f60";
export const GOVERNOR = "0x1f2e3d4c5b6a79889900aabbccddeeff00112233";
export const DELEGATE_A = "0xaaaa0000000000000000000000000000000000a1";
export const DELEGATE_B = "0xbbbb0000000000000000000000000000000000b2";
export const DORMANT = "0xdddd0000000000000000000000000000000000d3";
export const DELEGATOR_1 = "0x1111000000000000000000000000000000000011";
export const DELEGATOR_3 = "0x3333000000000000000000000000000000000033";
export const E18 = 10n ** 18n;

/** Deep copy without `structuredClone`, which jsdom does not expose. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type Fixture = {
  governance: { chain: string; tokenAddress: string; governorAddress: string; delegates: string[] };
  range: { fromBlock: number; toBlock: number };
  latestBlock: number;
  code: Record<string, string>;
  logs: RawLog[];
  error?: { code: number; message: string };
};

export function fixture(name: FixtureName): Fixture {
  return clone(fixtures[name]) as unknown as Fixture;
}

function matches(log: RawLog, topics: Array<string | null>): boolean {
  return topics.every((topic, index) => topic === null || log.topics?.[index]?.toLowerCase() === topic.toLowerCase());
}

/** Replays the recorded logs: filtered by address, topic and block range, exactly as a node would. */
export function recordedLogReader(data: Fixture): LogReader {
  return vi.fn(async ({ address, topics, fromBlock, toBlock }) => {
    if (data.error) throw new DelegateParticipationError("provider_unavailable", data.error.message);
    return data.logs.filter((log) => {
      const block = Number(BigInt(log.blockNumber ?? "0x0"));
      return (
        log.address?.toLowerCase() === address.toLowerCase() &&
        matches(log, topics) &&
        block >= fromBlock &&
        block <= toBlock
      );
    });
  });
}

export function recordedCodeReader(data: Fixture): CodeReader {
  return vi.fn(async (address: string) => data.code[address.toLowerCase()] ?? "0x");
}

export function recordedDeps(name: FixtureName, overrides: Partial<DelegateParticipationDeps> = {}): DelegateParticipationDeps {
  const data = fixture(name);
  return {
    readLogs: recordedLogReader(data),
    readCode: recordedCodeReader(data),
    readLatestBlock: vi.fn(async () => data.latestBlock),
    ...overrides,
  };
}

export function participationRequest(name: FixtureName, overrides: Record<string, unknown> = {}) {
  const data = fixture(name);
  return {
    chain: data.governance.chain,
    tokenAddress: data.governance.tokenAddress,
    governorAddress: data.governance.governorAddress,
    delegates: data.governance.delegates,
    fromBlock: data.range.fromBlock,
    toBlock: data.range.toBlock,
    topChanges: 10,
    ...overrides,
  };
}
