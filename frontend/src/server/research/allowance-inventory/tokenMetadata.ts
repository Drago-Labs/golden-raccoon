import { decodeFunctionResult, encodeFunctionData, erc20Abi } from "viem";
import { AllowanceProviderError, type AllowanceRpc } from "./rpc";

export type TokenMetadata = { symbol: string | null; decimals: number | null; balance: bigint | null; warnings: string[]; retryableFailures: number };

async function safeCall(rpc: AllowanceRpc, token: string, functionName: "symbol" | "decimals" | "balanceOf", args: readonly [`0x${string}`] | undefined, block: bigint) {
  const data = encodeFunctionData({ abi: erc20Abi, functionName, args: args as never });
  const result = await rpc.call(token, data, block);
  return decodeFunctionResult({ abi: erc20Abi, functionName, data: result as `0x${string}` });
}

export async function readTokenMetadata(rpc: AllowanceRpc, token: string, wallet: string, block: bigint): Promise<TokenMetadata> {
  const warnings: string[] = [];
  const [symbol, decimals, balance] = await Promise.allSettled([
    safeCall(rpc, token, "symbol", undefined, block),
    safeCall(rpc, token, "decimals", undefined, block),
    safeCall(rpc, token, "balanceOf", [wallet as `0x${string}`], block),
  ]);
  const retryableFailures = [symbol, decimals, balance].filter((item) => item.status === "rejected" && item.reason instanceof AllowanceProviderError && item.reason.retryable).length;
  if (symbol.status === "rejected") warnings.push(symbol.reason instanceof AllowanceProviderError && symbol.reason.retryable ? "Token symbol rate-limited; retry later" : "Token symbol unavailable");
  if (decimals.status === "rejected") warnings.push(decimals.reason instanceof AllowanceProviderError && decimals.reason.retryable ? "Token decimals rate-limited; retry later" : "Token decimals unavailable");
  if (balance.status === "rejected") warnings.push(balance.reason instanceof AllowanceProviderError && balance.reason.retryable ? "Wallet balance rate-limited; retry later" : "Wallet balance unavailable");
  const symbolValue = symbol.status === "fulfilled" && typeof symbol.value === "string" ? symbol.value.slice(0, 32) : null;
  const decimalsValue = decimals.status === "fulfilled" && typeof decimals.value === "number" && decimals.value <= 255 ? decimals.value : null;
  const balanceValue = balance.status === "fulfilled" && typeof balance.value === "bigint" ? balance.value : null;
  return { symbol: symbolValue, decimals: decimalsValue, balance: balanceValue, warnings, retryableFailures };
}
