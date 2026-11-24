import { SEP41_CONFORMANCE_LIMITS } from "./limits";
import type { SampledEvent } from "./schema";

export type EventSampler = {
  sampleEvents(contractId: string, network: string): Promise<SampledEvent[]>;
};

type RpcNetwork = {
  rpcUrl: string;
};

const NETWORKS: Record<string, RpcNetwork> = {
  "stellar-testnet": { rpcUrl: "https://soroban-testnet.stellar.org" },
  "stellar-pubnet": { rpcUrl: "https://mainnet.sorobanrpc.com" },
};

function topicString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.symbol === "string") return record.symbol;
    if (typeof record.string === "string") return record.string;
    if (typeof record.address === "string") return record.address;
  }
  return String(value ?? "");
}

/**
 * Normalizes a recorded or RPC event into the SampledEvent shape used by
 * eventShapes validation.
 */
export function normalizeSampledEvent(raw: unknown, index: number): SampledEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const topicsRaw = Array.isArray(record.topics) ? record.topics : [];
  const topics = topicsRaw.map(topicString);
  if (topics.length === 0) return null;

  const data = record.data;
  let dataKind: SampledEvent["dataKind"] = "other";
  let dataKeys: string[] = [];

  if (data === null || data === undefined) {
    dataKind = "empty";
  } else if (typeof data === "string" || typeof data === "number" || typeof data === "bigint") {
    dataKind = "i128";
  } else if (Array.isArray(data)) {
    dataKind = "vec";
  } else if (typeof data === "object") {
    const map = data as Record<string, unknown>;
    if (typeof map.i128 === "string" || typeof map.i128 === "number") {
      dataKind = "i128";
    } else if (Array.isArray(map.vec)) {
      dataKind = "vec";
    } else if (map.map && typeof map.map === "object") {
      dataKind = "map";
      dataKeys = Object.keys(map.map as object);
    } else {
      dataKind = "map";
      dataKeys = Object.keys(map);
    }
  }

  return {
    id: typeof record.id === "string" ? record.id : `event-${index}`,
    ledger: typeof record.ledger === "number" ? record.ledger : 0,
    topicName: topics[0],
    topics,
    dataKind,
    dataKeys,
    rawSummary: JSON.stringify(record).slice(0, 400),
  };
}

async function fetchJson(url: string, body: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEP41_CONFORMANCE_LIMITS.rpcTimeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Default event sampler via Soroban RPC `getEvents`. Tests inject recorded pages.
 */
export function createHttpEventSampler(): EventSampler {
  return {
    async sampleEvents(contractId, network) {
      const config = NETWORKS[network];
      if (!config) return [];

      const payload = await fetchJson(config.rpcUrl, {
        jsonrpc: "2.0",
        id: 1,
        method: "getEvents",
        params: {
          startLedger: 0,
          filters: [{ type: "contract", contractIds: [contractId] }],
          pagination: { limit: SEP41_CONFORMANCE_LIMITS.maxEventSamples },
        },
      });

      if (!payload || typeof payload !== "object") return [];
      const result = (payload as { result?: { events?: unknown[] } }).result;
      const events = Array.isArray(result?.events) ? result.events : [];
      const samples: SampledEvent[] = [];
      for (let index = 0; index < events.length && samples.length < SEP41_CONFORMANCE_LIMITS.maxEventSamples; index += 1) {
        const normalized = normalizeSampledEvent(events[index], index);
        if (normalized) samples.push(normalized);
      }
      return samples;
    },
  };
}
