import { addressFromSlot } from "./standardSlots";
import type { RpcReader } from "./storageReader";
const SELECTOR = "0x5c60da1b";
export async function resolveBeacon(reader: RpcReader, beacon: string, block: string) {
  const result = await reader.call("eth_call", [{ to: beacon, data: SELECTOR }, block]);
  if (typeof result !== "string") return null;
  return addressFromSlot(result.padStart(66, "0"));
}
