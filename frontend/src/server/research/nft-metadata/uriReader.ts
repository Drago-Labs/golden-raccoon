import { decodeAbiParameters, encodeFunctionData, parseAbiParameters, type Hex } from "viem";
import { RPC_TIMEOUT_MS } from "./limits";

export class NftRpcError extends Error {
  constructor(
    message: string,
    readonly kind: "rate_limit" | "provider" | "malformed",
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export type NftLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: bigint;
  transactionHash: string;
};

export interface NftRpc {
  blockNumber(): Promise<bigint>;
  /** Returns `null` on revert/unsupported-method (evidence, not failure); rethrows on provider/rate-limit errors. */
  call(to: string, data: string, block: bigint): Promise<string | null>;
  getLogs(params: { address: string; topics: Array<string | null>; fromBlock: bigint; toBlock: bigint }): Promise<NftLog[]>;
  /**
   * Like `call`, but surfaces the provider's revert reason text instead of
   * collapsing it to `null`. Used only to detect state-mutating functions
   * that revert with an access-control-flavored message — a call that
   * succeeds (even with empty return data, the common case for a `setX`
   * function) is indistinguishable from one that reverted with no reason,
   * so both are reported as `null` here, honestly reflecting "no evidence
   * either way" rather than a guess.
   */
  probeRevertReason(to: string, data: string, block: bigint): Promise<string | null>;
}

type RpcEnvelope<T> = { result?: T; error?: { code?: number; message?: string } };

function hex(value: bigint) {
  return `0x${value.toString(16)}`;
}

export function createHttpNftRpc(url: string, timeoutMs = RPC_TIMEOUT_MS): NftRpc {
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
      if (response.status === 429) throw new NftRpcError("Provider rate limit reached", "rate_limit", true);
      if (!response.ok) throw new NftRpcError(`Provider returned HTTP ${response.status}`, "provider", response.status >= 500);
      const payload = (await response.json()) as RpcEnvelope<T>;
      if (payload.error) {
        const message = payload.error.message ?? "RPC request failed";
        const limited = payload.error.code === -32005 || /limit|rate|too many/i.test(message);
        throw new NftRpcError(message, limited ? "rate_limit" : "provider", limited);
      }
      if (payload.result === undefined) throw new NftRpcError("RPC response omitted result", "malformed", false);
      return payload.result;
    } catch (error) {
      if (error instanceof NftRpcError) throw error;
      const message = error instanceof Error && error.name === "AbortError" ? "Provider request timed out" : "Provider request failed";
      throw new NftRpcError(message, "provider", true);
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
        if (error instanceof NftRpcError && error.kind !== "rate_limit") return null;
        throw error;
      }
    },
    async probeRevertReason(to, data, block) {
      try {
        await request<string>("eth_call", [{ to, data }, hex(block)]);
        return null;
      } catch (error) {
        if (error instanceof NftRpcError && error.kind === "rate_limit") throw error;
        return error instanceof NftRpcError ? error.message : null;
      }
    },
    async getLogs({ address, topics, fromBlock, toBlock }) {
      const result = await request<
        Array<{ address: string; topics: string[]; data: string; blockNumber: string; transactionHash: string }>
      >("eth_getLogs", [{ address, topics, fromBlock: hex(fromBlock), toBlock: hex(toBlock) }]);
      return result.map((entry) => ({
        address: entry.address,
        topics: entry.topics,
        data: entry.data,
        blockNumber: BigInt(entry.blockNumber),
        transactionHash: entry.transactionHash,
      }));
    },
  };
}

const supportsInterfaceAbi = [
  { type: "function", name: "supportsInterface", stateMutability: "view", inputs: [{ type: "bytes4" }], outputs: [{ type: "bool" }] },
] as const;
const tokenUriAbi = [
  { type: "function", name: "tokenURI", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "string" }] },
] as const;
const uriAbi = [
  { type: "function", name: "uri", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "string" }] },
] as const;
const contractUriAbi = [
  { type: "function", name: "contractURI", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;
const ownerAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

function decodeStringResult(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const [value] = decodeAbiParameters(parseAbiParameters("string"), raw as Hex);
    return value;
  } catch {
    return null;
  }
}

function decodeAddressResult(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const [value] = decodeAbiParameters(parseAbiParameters("address"), raw as Hex);
    return value;
  } catch {
    return null;
  }
}

export function decodeBoolResult(raw: string | null): boolean | null {
  if (!raw) return null;
  try {
    const [value] = decodeAbiParameters(parseAbiParameters("bool"), raw as Hex);
    return value;
  } catch {
    return null;
  }
}

export async function callSupportsInterface(rpc: NftRpc, address: string, interfaceId: Hex, block: bigint): Promise<boolean | null> {
  const data = encodeFunctionData({ abi: supportsInterfaceAbi, functionName: "supportsInterface", args: [interfaceId] });
  return decodeBoolResult(await rpc.call(address, data, block));
}

export async function readTokenUri(rpc: NftRpc, address: string, tokenId: bigint, block: bigint): Promise<string | null> {
  const data = encodeFunctionData({ abi: tokenUriAbi, functionName: "tokenURI", args: [tokenId] });
  return decodeStringResult(await rpc.call(address, data, block));
}

export async function readUri(rpc: NftRpc, address: string, tokenId: bigint, block: bigint): Promise<string | null> {
  const data = encodeFunctionData({ abi: uriAbi, functionName: "uri", args: [tokenId] });
  return decodeStringResult(await rpc.call(address, data, block));
}

export async function readContractUri(rpc: NftRpc, address: string, block: bigint): Promise<string | null> {
  const data = encodeFunctionData({ abi: contractUriAbi, functionName: "contractURI", args: [] });
  return decodeStringResult(await rpc.call(address, data, block));
}

export async function readOwner(rpc: NftRpc, address: string, block: bigint): Promise<string | null> {
  const data = encodeFunctionData({ abi: ownerAbi, functionName: "owner", args: [] });
  return decodeAddressResult(await rpc.call(address, data, block));
}

/**
 * ERC-1155's metadata extension lets `uri(id)` return one templated string
 * for every token, with `{id}` replaced client-side by the token's ID as a
 * lower-case, zero-padded 64-hex-digit string.
 */
export function substituteErc1155IdPlaceholder(uri: string, tokenId: bigint): string {
  if (!uri.includes("{id}")) return uri;
  return uri.replaceAll("{id}", tokenId.toString(16).padStart(64, "0"));
}

export type TokenUriSample = { tokenId: string; uri: string | null };

/** Reads `tokenURI`/`uri` for a bounded sample of token IDs, per the detected standard. */
export async function readTokenUriSamples(
  rpc: NftRpc,
  address: string,
  tokenIds: string[],
  standard: "erc721" | "erc1155",
  block: bigint,
): Promise<TokenUriSample[]> {
  return Promise.all(
    tokenIds.map(async (tokenIdString) => {
      const tokenId = BigInt(tokenIdString);
      const raw = standard === "erc1155" ? await readUri(rpc, address, tokenId, block) : await readTokenUri(rpc, address, tokenId, block);
      const uri = raw && standard === "erc1155" ? substituteErc1155IdPlaceholder(raw, tokenId) : raw;
      return { tokenId: tokenIdString, uri };
    }),
  );
}
