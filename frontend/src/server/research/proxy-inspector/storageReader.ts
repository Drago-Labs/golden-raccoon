export interface RpcReader { call(method: string, params: unknown[]): Promise<unknown> }
export class JsonRpcReader implements RpcReader {
  constructor(private readonly url: string) {}
  async call(method: string, params: unknown[]) {
    const response = await fetch(this.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error("RPC request failed");
    const body = await response.json() as { result?: unknown; error?: { message?: string } };
    if (body.error || body.result === undefined) throw new Error(body.error?.message ?? "RPC result unavailable");
    return body.result;
  }
}
