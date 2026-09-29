import type { RpcReader } from "./storageReader";
export async function hasCode(reader: RpcReader, address: string, block: string) {
  const code = await reader.call("eth_getCode", [address, block]);
  return typeof code === "string" && code !== "0x" && !/^0x0*$/.test(code);
}
