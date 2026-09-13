export type RpcLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber?: string;
  blockHash?: string;
};

export class AllowanceProviderError extends Error {
  constructor(
    message: string,
    readonly kind: "rate_limit" | "provider" | "malformed" | "reorg",
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface AllowanceRpc {
  blockNumber(): Promise<bigint>;
  blockHash(block: bigint): Promise<string | null>;
  logs(input: { fromBlock: bigint; toBlock: bigint; topics: (string | null)[] }): Promise<RpcLog[]>;
  call(to: string, data: string, block: bigint): Promise<string>;
}

type RpcEnvelope<T> = { result?: T; error?: { code?: number; message?: string } };

function hex(value: bigint) {
  return `0x${value.toString(16)}`;
}

export function createHttpAllowanceRpc(url: string, timeoutMs = 12_000): AllowanceRpc {
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
      if (response.status === 429) throw new AllowanceProviderError("Provider rate limit reached", "rate_limit", true);
      if (!response.ok) throw new AllowanceProviderError(`Provider returned HTTP ${response.status}`, "provider", response.status >= 500);
      const payload = await response.json() as RpcEnvelope<T>;
      if (payload.error) {
        const message = payload.error.message ?? "RPC request failed";
        const limited = payload.error.code === -32005 || /limit|rate|too many/i.test(message);
        throw new AllowanceProviderError(message, limited ? "rate_limit" : "provider", limited);
      }
      if (payload.result === undefined) throw new AllowanceProviderError("RPC response omitted result", "malformed", false);
      return payload.result;
    } catch (error) {
      if (error instanceof AllowanceProviderError) throw error;
      const message = error instanceof Error && error.name === "AbortError" ? "Provider request timed out" : "Provider request failed";
      throw new AllowanceProviderError(message, "provider", true);
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
    logs(input) {
      return request<RpcLog[]>("eth_getLogs", [{ fromBlock: hex(input.fromBlock), toBlock: hex(input.toBlock), topics: input.topics }]);
    },
    call(to, data, block) {
      return request<string>("eth_call", [{ to, data }, hex(block)]);
    },
  };
}
