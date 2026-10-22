import type { SupplySnapshot } from "./schema";
import { CIRCULATING_SUPPLY_LIMITS } from "./limits";
const selector = { totalSupply: "0x18160ddd", balanceOf: "0x70a08231" } as const;
async function rpc(rpcUrl: string, method: string, params: unknown[]) { const response = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(CIRCULATING_SUPPLY_LIMITS.timeoutMs), cache: "no-store" }); if (!response.ok) throw new Error("EVM provider unavailable"); return (await response.json()) as { result?: string }; }
export async function readEvmSupply(rpcUrl: string, token: string, holders: string[], block = "latest"): Promise<SupplySnapshot> {
  const blockTag = typeof block === "number" ? `0x${block.toString(16)}` : block;
  const total = await rpc(rpcUrl, "eth_call", [{ to: token, data: selector.totalSupply }, blockTag]);
  const balances: Record<string, string> = {};
  for (const holder of holders) { const data = selector.balanceOf + holder.toLowerCase().replace(/^0x/, "").padStart(64, "0"); const value = await rpc(rpcUrl, "eth_call", [{ to: token, data }, blockTag]); balances[holder.toLowerCase()] = BigInt(value.result ?? "0x0").toString(); }
  const observed = await rpc(rpcUrl, "eth_blockNumber", []);
  return { totalSupply: BigInt(total.result ?? "0x0").toString(), balances, observation: Number(BigInt(observed.result ?? "0x0")), sourceUrl: rpcUrl };
}
