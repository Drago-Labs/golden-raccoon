import { vi } from "vitest";
import { findAsset, type EvmDeployment, type StellarDeployment } from "@/server/research/stablecoin-flows/assetRegistry";
import { TRANSFER_TOPIC, ZERO_TOPIC } from "@/server/research/stablecoin-flows/evmEvents";
import { resolveWindow, type ResolvedWindow } from "@/server/research/stablecoin-flows/windowing";
import multiChain from "./data/multi-chain-flows.json";
import partialCoverage from "./data/partial-coverage.json";
import providerUnavailable from "./data/provider-unavailable.json";
import singleChain from "./data/single-chain.json";

export const fixtures = { multiChain, singleChain, partialCoverage, providerUnavailable };

export const WINDOW_START = "2026-11-18T00:00:00.000Z";
export const WINDOW_END = "2026-11-20T00:00:00.000Z";
export const EVM_RPC = "https://rpc.test.invalid";
export const HORIZON = "https://horizon.test.invalid";

/** Deep copy without `structuredClone`, which jsdom does not expose. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function window_(start = WINDOW_START, end = WINDOW_END): ResolvedWindow {
  return resolveWindow(start, end);
}

export function usdc() {
  return findAsset("usdc");
}

export function deployment(chain: string): EvmDeployment {
  const found = usdc().deployments.find((candidate) => candidate.chain === chain);
  if (!found || found.kind !== "evm") throw new Error(`no EVM USDC deployment for ${chain}`);
  return found;
}

export function stellarDeployment(): StellarDeployment {
  const found = usdc().deployments.find((candidate) => candidate.kind === "stellar");
  if (!found || found.kind !== "stellar") throw new Error("no Stellar USDC deployment");
  return found;
}

type RecordedLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
};

type RecordedChain = {
  latestBlock?: string;
  latestBlockTimestamp?: string;
  blocks?: Record<string, string>;
  logs?: RecordedLog[];
  error?: { code: number; message: string };
  httpStatus?: number;
  body?: string;
};

type RecordedFixture = {
  evm?: Record<string, RecordedChain>;
  stellar?: { issuer: string; records?: unknown[]; httpStatus?: number };
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

/** Does a recorded log match the topic filter the reader asked for? */
function matchesFilter(log: RecordedLog, filter: Array<string | null>): boolean {
  return filter.every((topic, index) => topic === null || log.topics[index]?.toLowerCase() === topic.toLowerCase());
}

/**
 * Replays recorded provider responses: JSON-RPC for EVM chains (dispatched by
 * method and, for `eth_getLogs`, by the requested topic filter and block
 * range) and Horizon payment pages for Stellar. Nothing reaches the network.
 */
export function recordedFetch(fixture: RecordedFixture, options: { chainOf?: (url: string) => string } = {}) {
  const chainOf = options.chainOf ?? ((url: string) => new URL(url).hostname.split(".")[0]);

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (init?.method === "POST") {
      const chain = chainOf(url);
      const recorded = fixture.evm?.[chain];
      if (!recorded) throw new Error(`no recorded EVM responses for ${chain}`);
      if (recorded.httpStatus) return new Response(recorded.body ?? "", { status: recorded.httpStatus });
      const body = JSON.parse(String(init.body)) as { method: string; params: unknown[] };
      if (recorded.error) return jsonResponse({ jsonrpc: "2.0", id: 1, error: recorded.error });

      if (body.method === "eth_blockNumber") return jsonResponse({ result: recorded.latestBlock });
      if (body.method === "eth_getBlockByNumber") {
        const [tag] = body.params as [string];
        const timestamp =
          tag === recorded.latestBlock ? recorded.latestBlockTimestamp : recorded.blocks?.[tag];
        return jsonResponse({ result: timestamp ? { timestamp } : null });
      }
      if (body.method === "eth_getLogs") {
        const [filter] = body.params as [{ topics: Array<string | null>; fromBlock: string; toBlock: string }];
        const from = BigInt(filter.fromBlock);
        const to = BigInt(filter.toBlock);
        const logs = (recorded.logs ?? []).filter(
          (log) =>
            matchesFilter(log, filter.topics) && BigInt(log.blockNumber) >= from && BigInt(log.blockNumber) <= to,
        );
        return jsonResponse({ result: logs });
      }
      throw new Error(`unexpected JSON-RPC method ${body.method}`);
    }

    const stellar = fixture.stellar;
    if (!stellar) throw new Error(`no recorded Horizon responses for ${url}`);
    if (stellar.httpStatus) return new Response("", { status: stellar.httpStatus });
    return jsonResponse({ _embedded: { records: stellar.records ?? [] } });
  });
}

/** The mint and burn topic filters the EVM reader is expected to ask for. */
export const TOPIC_FILTERS = {
  mint: [TRANSFER_TOPIC, ZERO_TOPIC],
  burn: [TRANSFER_TOPIC, null, ZERO_TOPIC],
} as const;

export function flowRequest(overrides: Record<string, unknown> = {}) {
  return {
    assetId: "usdc",
    chains: ["ethereum", "stellar"],
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    topEvents: 10,
    ...overrides,
  };
}
