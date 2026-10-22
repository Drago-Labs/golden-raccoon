import { RPC_TIMEOUT_MS } from "./limits";

export class VaultRpcError extends Error {
  constructor(
    message: string,
    readonly kind: "rate_limit" | "provider" | "malformed",
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface VaultRpc {
  blockNumber(): Promise<bigint>;
  blockHash(block: bigint): Promise<string | null>;
  /** Returns `null` on revert/unsupported-method (evidence, not failure); rethrows on provider/rate-limit errors. */
  call(to: string, data: string, block: bigint): Promise<string | null>;
}

type RpcEnvelope<T> = { result?: T; error?: { code?: number; message?: string } };

function hex(value: bigint) {
  return `0x${value.toString(16)}`;
}

export function createHttpVaultRpc(url: string, timeoutMs = RPC_TIMEOUT_MS): VaultRpc {
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
      if (response.status === 429) throw new VaultRpcError("Provider rate limit reached", "rate_limit", true);
      if (!response.ok) throw new VaultRpcError(`Provider returned HTTP ${response.status}`, "provider", response.status >= 500);
      const payload = (await response.json()) as RpcEnvelope<T>;
      if (payload.error) {
        const message = payload.error.message ?? "RPC request failed";
        const limited = payload.error.code === -32005 || /limit|rate|too many/i.test(message);
        throw new VaultRpcError(message, limited ? "rate_limit" : "provider", limited);
      }
      if (payload.result === undefined) throw new VaultRpcError("RPC response omitted result", "malformed", false);
      return payload.result;
    } catch (error) {
      if (error instanceof VaultRpcError) throw error;
      const message = error instanceof Error && error.name === "AbortError" ? "Provider request timed out" : "Provider request failed";
      throw new VaultRpcError(message, "provider", true);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async blockNumber() {
      return BigInt(await request<string>("eth_blockNumber", []));
    },
    async blockHash(block) {
      const result = await request<{ hash?: string } | null>("eth_getBlockByNumber", [hex(block), false]);
      return result?.hash ?? null;
    },
    async call(to, data, block) {
      try {
        const result = await request<string>("eth_call", [{ to, data }, hex(block)]);
        return result === "0x" ? null : result;
      } catch (error) {
        if (error instanceof VaultRpcError && error.kind !== "rate_limit") return null;
        throw error;
      }
    },
  };
}

/** Hand-picked 4-byte selectors (keccak256 of the signature), verified against viem's `toFunctionSelector`. */
export const SELECTORS = {
  asset: "0x38d52e0f",
  totalAssets: "0x01e1d114",
  totalSupply: "0x18160ddd",
  convertToAssets: "0x07a2d13a",
  previewDeposit: "0xef8b30f7",
  previewRedeem: "0x4cdad506",
  balanceOf: "0x70a08231",
} as const;

export function encodeUint256Arg(value: bigint): string {
  if (value < 0n) throw new RangeError("uint256 argument must be non-negative");
  return value.toString(16).padStart(64, "0");
}

export function encodeAddressArg(address: string): string {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

export function decodeAddress(word: string | null): string | null {
  if (!word) return null;
  const hexValue = word.replace(/^0x/, "").slice(-40);
  return `0x${hexValue}`;
}

export function decodeUint(word: string | null): bigint | null {
  if (!word) return null;
  try {
    return BigInt(word);
  } catch {
    return null;
  }
}

export type VaultCoreReads = {
  asset: string | null;
  totalAssets: bigint | null;
  totalSupply: bigint | null;
};

/** Reads `asset()`, `totalAssets()`, and `totalSupply()` at `block`. */
export async function readVaultCore(rpc: VaultRpc, vault: string, block: bigint): Promise<VaultCoreReads> {
  const [assetRaw, totalAssetsRaw, totalSupplyRaw] = await Promise.all([
    rpc.call(vault, SELECTORS.asset, block),
    rpc.call(vault, SELECTORS.totalAssets, block),
    rpc.call(vault, SELECTORS.totalSupply, block),
  ]);
  return {
    asset: decodeAddress(assetRaw),
    totalAssets: decodeUint(totalAssetsRaw),
    totalSupply: decodeUint(totalSupplyRaw),
  };
}

export async function readConvertToAssets(rpc: VaultRpc, vault: string, shares: bigint, block: bigint): Promise<bigint | null> {
  const raw = await rpc.call(vault, SELECTORS.convertToAssets + encodeUint256Arg(shares), block);
  return decodeUint(raw);
}

export async function readPreviewDeposit(rpc: VaultRpc, vault: string, assets: bigint, block: bigint): Promise<bigint | null> {
  const raw = await rpc.call(vault, SELECTORS.previewDeposit + encodeUint256Arg(assets), block);
  return decodeUint(raw);
}

export async function readPreviewRedeem(rpc: VaultRpc, vault: string, shares: bigint, block: bigint): Promise<bigint | null> {
  const raw = await rpc.call(vault, SELECTORS.previewRedeem + encodeUint256Arg(shares), block);
  return decodeUint(raw);
}

export async function readErc20Balance(rpc: VaultRpc, token: string, holder: string, block: bigint): Promise<bigint | null> {
  const raw = await rpc.call(token, SELECTORS.balanceOf + encodeAddressArg(holder), block);
  return decodeUint(raw);
}
