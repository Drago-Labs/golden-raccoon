export type CodeReader = (address: string) => Promise<`0x${string}`>;
export function createCodeReader(rpcUrl: string): CodeReader {
  return async (address) => {
    const response = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] }) });
    if (!response.ok) throw new Error("Code provider unavailable");
    const body = await response.json() as { result?: `0x${string}`; error?: unknown };
    if (!body.result || body.error) throw new Error("Code provider unavailable");
    return body.result;
  };
}
