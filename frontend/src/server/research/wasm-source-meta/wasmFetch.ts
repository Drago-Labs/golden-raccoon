import { WasmSourceMetaError } from "./errors";
import { WASM_SOURCE_META_LIMITS } from "./limits";

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/\s+/g, "");
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(normalized, "base64"));
  }
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export type WasmFetchResult =
  | { status: "available"; wasm: Uint8Array; wasmHash: string }
  | { status: "not_found"; reason: string }
  | { status: "unavailable"; reason: string };

export type WasmFetcher = (network: string, contractId: string) => Promise<WasmFetchResult>;

const RPC_URLS: Record<string, string> = {
  "stellar-testnet": "https://soroban-testnet.stellar.org",
  "stellar-pubnet": "https://rpc.stellar.org",
};

/**
 * Fetch deployed Wasm bytes for a contract via Soroban RPC.
 * Read-only: never submits a transaction.
 */
export async function fetchContractWasm(
  network: string,
  contractId: string,
  options: { signal?: AbortSignal } = {},
): Promise<WasmFetchResult> {
  const rpcUrl = RPC_URLS[network];
  if (!rpcUrl) {
    return { status: "unavailable", reason: `Unsupported network: ${network}` };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WASM_SOURCE_META_LIMITS.timeoutMs);
    const signal = options.signal ?? controller.signal;

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getContractData",
        params: {
          contract: contractId,
          key: { type: "LedgerKeyContractCode" },
          durability: "persistent",
        },
      }),
      signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      return { status: "unavailable", reason: `RPC HTTP ${response.status}` };
    }

    const body = (await response.json()) as {
      result?: { wasm?: string; wasmHash?: string };
      error?: { message?: string };
    };

    if (body.error) {
      const message = body.error.message ?? "RPC error";
      if (/not found|missing/i.test(message)) {
        return { status: "not_found", reason: message };
      }
      return { status: "unavailable", reason: message };
    }

    const wasmB64 = body.result?.wasm;
    if (!wasmB64) {
      // Production RPC may require getLedgerEntries; treat empty as not found for isolation.
      return { status: "not_found", reason: "Contract Wasm was not returned by the provider." };
    }

    const binary = decodeBase64(wasmB64);
    if (binary.length > WASM_SOURCE_META_LIMITS.maxWasmBytes) {
      throw new WasmSourceMetaError("response_too_large", "Wasm exceeds size limit.");
    }

    return {
      status: "available",
      wasm: binary,
      wasmHash: body.result?.wasmHash ?? "unknown",
    };
  } catch (error) {
    if (error instanceof WasmSourceMetaError) throw error;
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : "Provider unavailable",
    };
  }
}
