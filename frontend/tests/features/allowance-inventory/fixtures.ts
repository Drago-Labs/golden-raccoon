import { decodeFunctionData, encodeFunctionResult, erc20Abi, padHex } from "viem";
import { APPROVAL_TOPIC } from "@/server/research/allowance-inventory/logReader";
import { MAX_UINT256 } from "@/server/research/allowance-inventory/allowanceReader";
import { AllowanceProviderError, type AllowanceRpc, type RpcLog } from "@/server/research/allowance-inventory/rpc";

if (typeof window !== "undefined" && !window.localStorage) {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", { value: {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } });
}

export const walletA = "0x1111111111111111111111111111111111111111";
export const walletB = "0x2222222222222222222222222222222222222222";
export const spenderA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const spenderB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
export const finiteToken = "0x3333333333333333333333333333333333333333";
export const maximumToken = "0x4444444444444444444444444444444444444444";
export const revokedToken = "0x5555555555555555555555555555555555555555";

const ownerTopic = padHex(walletA as `0x${string}`, { size: 32 });
const spenderTopic = (spender: string) => padHex(spender as `0x${string}`, { size: 32 });

export function approvalLog(token: string, spender: string): RpcLog {
  return { address: token, topics: [APPROVAL_TOPIC, ownerTopic, spenderTopic(spender)], data: padHex("0x1", { size: 32 }), blockNumber: "0x64", blockHash: "0xstable" };
}

export class FixtureRpc implements AllowanceRpc {
  logsResult: RpcLog[] = [];
  logError: Error | null = null;
  hashReads = ["0xstable", "0xstable"];
  malformedTokens = new Set<string>();
  rateLimitedMetadataTokens = new Set<string>();
  allowanceByToken = new Map<string, bigint>([
    [finiteToken, 2500000n],
    [maximumToken, MAX_UINT256],
    [revokedToken, 0n],
  ]);
  allowanceOwners: string[] = [];

  async blockNumber() { return 1000n; }
  async blockHash() { return this.hashReads.shift() ?? "0xstable"; }
  async logs() {
    if (this.logError) throw this.logError;
    return this.logsResult;
  }
  async call(to: string, data: string) {
    if (this.malformedTokens.has(to.toLowerCase())) return "0xbroken";
    const decoded = decodeFunctionData({ abi: erc20Abi, data: data as `0x${string}` });
    if (decoded.functionName === "allowance") {
      this.allowanceOwners.push(String(decoded.args[0]).toLowerCase());
      return encodeFunctionResult({ abi: erc20Abi, functionName: "allowance", result: this.allowanceByToken.get(to.toLowerCase()) ?? 0n });
    }
    if (this.rateLimitedMetadataTokens.has(to.toLowerCase())) throw new AllowanceProviderError("rate limited", "rate_limit", true);
    if (decoded.functionName === "balanceOf") return encodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", result: 1000000n });
    if (decoded.functionName === "decimals") return encodeFunctionResult({ abi: erc20Abi, functionName: "decimals", result: 6 });
    if (decoded.functionName === "symbol") return encodeFunctionResult({ abi: erc20Abi, functionName: "symbol", result: to === finiteToken ? "FINITE" : "TOKEN" });
    throw new Error("Unexpected call");
  }
}

export function rateLimitedLogs() {
  return new AllowanceProviderError("too many requests", "rate_limit", true);
}
