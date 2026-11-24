import type { RawPoolEvent } from "./eventLayouts";
import { POOL_HISTORY_LIMITS } from "./limits";
import type { StellarNetwork } from "./schema";

export type PoolEventRead = {
  events: RawPoolEvent[];
  openingReserveA: bigint;
  openingReserveB: bigint;
  storageReserveA: bigint | null;
  storageReserveB: bigint | null;
  truncated: boolean;
  oldestLedger: number | null;
};

export type ReadOutcome<T> =
  | { status: "ok"; value: T }
  | { status: "missing" }
  | { status: "unavailable"; reason: string };

export type EventFetcher = (url: string) => Promise<Response>;

function rpcBase(network: StellarNetwork): string {
  return network === "stellar-pubnet" ? "https://soroban-rpc.mainnet.stellar.org" : "https://soroban-rpc.testnet.stellar.org";
}

/** Build a getEvents request URL for a pool contract over a ledger window. */
export function eventsRequestUrl(network: StellarNetwork, poolId: string, fromLedger: number): string {
  const base = rpcBase(network);
  return `${base}/?pool=${encodeURIComponent(poolId)}&startLedger=${fromLedger}`;
}

/**
 * Read swap/deposit/withdraw/sync events for a pool. Production readers talk to RPC;
 * tests inject fixtures through the service dependency.
 */
export async function readPoolEvents(
  network: StellarNetwork,
  poolId: string,
  fromLedger: number,
  toLedger: number,
  fetchImpl: EventFetcher = fetch,
  limits = POOL_HISTORY_LIMITS,
): Promise<ReadOutcome<PoolEventRead>> {
  try {
    const url = eventsRequestUrl(network, poolId, fromLedger);
    const response = await fetchImpl(url);
    if (response.status === 404) return { status: "missing" };
    if (!response.ok) return { status: "unavailable", reason: `RPC returned HTTP ${response.status}` };

    const body = (await response.json()) as {
      events?: RawPoolEvent[];
      openingReserveA?: string;
      openingReserveB?: string;
      storageReserveA?: string | null;
      storageReserveB?: string | null;
      truncated?: boolean;
    };

    const events = (body.events ?? [])
      .filter((event) => event.ledger >= fromLedger && event.ledger <= toLedger)
      .slice(0, limits.maxEvents);

    return {
      status: "ok",
      value: {
        events,
        openingReserveA: BigInt(body.openingReserveA ?? "0"),
        openingReserveB: BigInt(body.openingReserveB ?? "0"),
        storageReserveA: body.storageReserveA == null ? null : BigInt(body.storageReserveA),
        storageReserveB: body.storageReserveB == null ? null : BigInt(body.storageReserveB),
        truncated: Boolean(body.truncated) || (body.events?.length ?? 0) > limits.maxEvents,
        oldestLedger: events.length === 0 ? null : Math.min(...events.map((event) => event.ledger)),
      },
    };
  } catch (error) {
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : "Pool event provider unavailable",
    };
  }
}
