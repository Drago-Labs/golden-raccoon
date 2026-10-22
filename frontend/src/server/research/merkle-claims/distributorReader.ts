import { decodeAbiParameters, encodeFunctionData, parseAbiParameters, type Hex } from "viem";
import { RPC_TIMEOUT_MS } from "./limits";

export class MerkleRpcError extends Error {
  constructor(
    message: string,
    readonly kind: "rate_limit" | "provider" | "malformed",
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface MerkleRpc {
  blockNumber(): Promise<bigint>;
  /** Returns `null` on revert/unsupported-method (evidence, not failure); rethrows on provider/rate-limit errors. */
  call(to: string, data: string, block: bigint): Promise<string | null>;
}

type RpcEnvelope<T> = { result?: T; error?: { code?: number; message?: string } };

function hex(value: bigint) {
  return `0x${value.toString(16)}`;
}

export function createHttpMerkleRpc(url: string, timeoutMs = RPC_TIMEOUT_MS): MerkleRpc {
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
      if (response.status === 429) throw new MerkleRpcError("Provider rate limit reached", "rate_limit", true);
      if (!response.ok) throw new MerkleRpcError(`Provider returned HTTP ${response.status}`, "provider", response.status >= 500);
      const payload = (await response.json()) as RpcEnvelope<T>;
      if (payload.error) {
        const message = payload.error.message ?? "RPC request failed";
        const limited = payload.error.code === -32005 || /limit|rate|too many/i.test(message);
        throw new MerkleRpcError(message, limited ? "rate_limit" : "provider", limited);
      }
      if (payload.result === undefined) throw new MerkleRpcError("RPC response omitted result", "malformed", false);
      return payload.result;
    } catch (error) {
      if (error instanceof MerkleRpcError) throw error;
      const message = error instanceof Error && error.name === "AbortError" ? "Provider request timed out" : "Provider request failed";
      throw new MerkleRpcError(message, "provider", true);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async blockNumber() {
      return BigInt(await request<string>("eth_blockNumber", []));
    },
    async call(to, data, block) {
      try {
        const result = await request<string>("eth_call", [{ to, data }, hex(block)]);
        return result === "0x" ? null : result;
      } catch (error) {
        if (error instanceof MerkleRpcError && error.kind !== "rate_limit") return null;
        throw error;
      }
    },
  };
}

const merkleRootAbi = [{ type: "function", name: "merkleRoot", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] }] as const;
const tokenAbi = [{ type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;
const isClaimedAbi = [
  { type: "function", name: "isClaimed", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export async function readMerkleRoot(rpc: MerkleRpc, distributor: string, block: bigint): Promise<Hex | null> {
  const data = encodeFunctionData({ abi: merkleRootAbi, functionName: "merkleRoot", args: [] });
  const raw = await rpc.call(distributor, data, block);
  if (!raw) return null;
  try {
    return decodeAbiParameters(parseAbiParameters("bytes32"), raw as Hex)[0];
  } catch {
    return null;
  }
}

export async function readToken(rpc: MerkleRpc, distributor: string, block: bigint): Promise<string | null> {
  const data = encodeFunctionData({ abi: tokenAbi, functionName: "token", args: [] });
  const raw = await rpc.call(distributor, data, block);
  if (!raw) return null;
  try {
    return decodeAbiParameters(parseAbiParameters("address"), raw as Hex)[0];
  } catch {
    return null;
  }
}

export async function readIsClaimed(rpc: MerkleRpc, distributor: string, index: bigint, block: bigint): Promise<boolean | null> {
  const data = encodeFunctionData({ abi: isClaimedAbi, functionName: "isClaimed", args: [index] });
  const raw = await rpc.call(distributor, data, block);
  if (!raw) return null;
  try {
    return decodeAbiParameters(parseAbiParameters("bool"), raw as Hex)[0];
  } catch {
    return null;
  }
}
