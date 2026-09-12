import { decodeFunctionResult, encodeFunctionData, erc20Abi } from "viem";
import type { AllowanceRpc } from "./rpc";

export const MAX_UINT256 = (1n << 256n) - 1n;

export async function readAllowance(rpc: AllowanceRpc, token: string, owner: string, spender: string, block: bigint): Promise<bigint> {
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [owner as `0x${string}`, spender as `0x${string}`] });
  const result = await rpc.call(token, data, block);
  try {
    return decodeFunctionResult({ abi: erc20Abi, functionName: "allowance", data: result as `0x${string}` });
  } catch {
    throw new Error("Token returned malformed allowance data");
  }
}

export function classifyAllowance(value: bigint): "revoked" | "finite" | "maximum" {
  if (value === 0n) return "revoked";
  if (value === MAX_UINT256) return "maximum";
  return "finite";
}
