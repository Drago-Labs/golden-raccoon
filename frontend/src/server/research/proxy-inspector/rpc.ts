/**
 * The JSON-RPC reader used in production.
 *
 * It is kept apart from the service for two reasons. The service stays
 * testable without a network, and the endpoint URL never comes from the
 * caller: it is resolved from the server's own network configuration, so a
 * request cannot point this feature at an arbitrary outbound host.
 */
import { resolveEvmRpcUrl } from "@/lib/evm/config";
import { ProxyInspectorError, type ChainReader } from "./schema";

const RPC_TIMEOUT_MS = 8_000;

async function rpcCall(url: string, method: string, params: unknown[]): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new ProxyInspectorError("rpc_http_error", `${method} returned HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as { result?: unknown; error?: { message?: string } };

    if (payload.error) {
      throw new ProxyInspectorError("rpc_error", payload.error.message ?? `${method} failed.`);
    }

    if (typeof payload.result !== "string") {
      throw new ProxyInspectorError("rpc_unexpected_result", `${method} returned no hex result.`);
    }

    return payload.result;
  } finally {
    clearTimeout(timeout);
  }
}

export function createRpcReader(network: string): ChainReader {
  const url = resolveEvmRpcUrl(network);

  return {
    getBlockNumber: () => rpcCall(url, "eth_blockNumber", []),
    getCode: (address, block) => rpcCall(url, "eth_getCode", [address, block]),
    getStorageAt: (address, slot, block) => rpcCall(url, "eth_getStorageAt", [address, slot, block]),
    call: (to, data, block) => rpcCall(url, "eth_call", [{ to, data }, block]),
  };
}
