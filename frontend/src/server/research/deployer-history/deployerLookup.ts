import { getContractAddress } from "viem";
import { CREATION_SEARCH_MAX_ITERATIONS, RPC_TIMEOUT_MS } from "./limits";
import type { DeployerLookup } from "./schema";

export class DeployerRpcError extends Error {
  constructor(
    message: string,
    readonly kind: "rate_limit" | "provider" | "malformed",
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export type RpcTransaction = {
  hash: string;
  from: string;
  to: string | null;
  nonce: number;
  /** Hex-encoded wei value. */
  value: string;
};

export type RpcBlock = {
  number: number;
  transactions: RpcTransaction[];
};

export interface DeployerRpc {
  blockNumber(): Promise<bigint>;
  /** Returns `"0x"` when the address has no code at `block`. */
  getCode(address: string, block: bigint): Promise<string>;
  getBlock(block: bigint): Promise<RpcBlock | null>;
}

type RpcEnvelope<T> = { result?: T; error?: { code?: number; message?: string } };

function hex(value: bigint) {
  return `0x${value.toString(16)}`;
}

function toRpcTransaction(raw: unknown): RpcTransaction | null {
  if (!raw || typeof raw !== "object") return null;
  const tx = raw as Record<string, unknown>;
  if (typeof tx.hash !== "string" || typeof tx.from !== "string") return null;
  return {
    hash: tx.hash,
    from: tx.from,
    to: typeof tx.to === "string" ? tx.to : null,
    nonce: typeof tx.nonce === "string" ? Number.parseInt(tx.nonce, 16) : 0,
    value: typeof tx.value === "string" ? tx.value : "0x0",
  };
}

export function createHttpDeployerRpc(url: string, timeoutMs = RPC_TIMEOUT_MS): DeployerRpc {
  let id = 0;
  async function request<T>(method: string, params: unknown[]): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.status === 429) throw new DeployerRpcError("Provider rate limit reached", "rate_limit", true);
      if (!response.ok) throw new DeployerRpcError(`Provider returned HTTP ${response.status}`, "provider", response.status >= 500);
      const payload = (await response.json()) as RpcEnvelope<T>;
      if (payload.error) {
        const message = payload.error.message ?? "RPC request failed";
        const limited = payload.error.code === -32005 || /limit|rate|too many/i.test(message);
        throw new DeployerRpcError(message, limited ? "rate_limit" : "provider", limited);
      }
      if (payload.result === undefined) throw new DeployerRpcError("RPC response omitted result", "malformed", false);
      return payload.result;
    } catch (error) {
      if (error instanceof DeployerRpcError) throw error;
      const message = error instanceof Error && error.name === "AbortError" ? "Provider request timed out" : "Provider request failed";
      throw new DeployerRpcError(message, "provider", true);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async blockNumber() {
      return BigInt(await request<string>("eth_blockNumber", []));
    },
    async getCode(address, block) {
      return request<string>("eth_getCode", [address, hex(block)]);
    },
    async getBlock(block) {
      const raw = await request<{ number?: string; transactions?: unknown[] } | null>("eth_getBlockByNumber", [hex(block), true]);
      if (!raw || typeof raw.number !== "string") return null;
      const transactions = (raw.transactions ?? []).map(toRpcTransaction).filter((t): t is RpcTransaction => t !== null);
      return { number: Number.parseInt(raw.number, 16), transactions };
    },
  };
}

function hasCode(code: string): boolean {
  return typeof code === "string" && code !== "0x" && !/^0x0*$/.test(code);
}

/**
 * Binary-searches for the first block at which `address` has code,
 * assuming code never disappears once deployed (true for every address
 * except a `SELFDESTRUCT`, which this feature does not attempt to detect).
 * Bounded by `CREATION_SEARCH_MAX_ITERATIONS`.
 */
export async function findCreationBlock(rpc: DeployerRpc, address: string, latest: bigint): Promise<bigint | null> {
  if (!hasCode(await rpc.getCode(address, latest))) return null;

  let low = 0n;
  let high = latest;
  for (let i = 0; i < CREATION_SEARCH_MAX_ITERATIONS && low < high; i += 1) {
    const mid = low + (high - low) / 2n;
    const code = await rpc.getCode(address, mid);
    if (hasCode(code)) {
      high = mid;
    } else {
      low = mid + 1n;
    }
  }
  return low;
}

/**
 * Within the creation block, finds the direct `to: null` creation
 * transaction whose sender and nonce reproduce `address` via the
 * standard CREATE formula. Returns `direct: false` when no transaction
 * in the block matches — most often because the contract was deployed
 * through a factory's internal `CREATE`/`CREATE2`, which is not visible
 * without trace-level data this feature does not use.
 */
export function findDeployerInBlock(block: RpcBlock, address: string): DeployerLookup {
  const target = address.toLowerCase();
  for (const tx of block.transactions) {
    if (tx.to !== null) continue;
    const candidate = getContractAddress({ from: tx.from as `0x${string}`, nonce: BigInt(tx.nonce) });
    if (candidate.toLowerCase() === target) {
      return { deployer: tx.from, creationBlock: block.number, creationTxHash: tx.hash, direct: true };
    }
  }
  return { deployer: null, creationBlock: block.number, creationTxHash: null, direct: false };
}
