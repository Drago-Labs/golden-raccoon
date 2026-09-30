export class PermitRpcError extends Error {
  constructor(
    message: string,
    readonly kind: "rate_limit" | "provider" | "malformed",
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface PermitRpc {
  blockNumber(): Promise<bigint>;
  call(to: string, data: string, block: bigint): Promise<string | null>;
}

type RpcEnvelope<T> = { result?: T; error?: { code?: number; message?: string } };

function hex(value: bigint) {
  return `0x${value.toString(16)}`;
}

export function createHttpPermitRpc(url: string, timeoutMs = 12_000): PermitRpc {
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
      if (response.status === 429) throw new PermitRpcError("Provider rate limit reached", "rate_limit", true);
      if (!response.ok) throw new PermitRpcError(`Provider returned HTTP ${response.status}`, "provider", response.status >= 500);
      const payload = (await response.json()) as RpcEnvelope<T>;
      if (payload.error) {
        const message = payload.error.message ?? "RPC request failed";
        const limited = payload.error.code === -32005 || /limit|rate|too many/i.test(message);
        throw new PermitRpcError(message, limited ? "rate_limit" : "provider", limited);
      }
      if (payload.result === undefined) throw new PermitRpcError("RPC response omitted result", "malformed", false);
      return payload.result;
    } catch (error) {
      if (error instanceof PermitRpcError) throw error;
      const message = error instanceof Error && error.name === "AbortError" ? "Provider request timed out" : "Provider request failed";
      throw new PermitRpcError(message, "provider", true);
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
        if (error instanceof PermitRpcError && error.kind !== "rate_limit") return null;
        throw error;
      }
    },
  };
}
