import { BridgeLatencyError } from "./errors";
export function parseBridgeId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9-]{2,40}$/.test(value)) {
    throw new BridgeLatencyError("invalid_bridge", "Bridge id must be a short slug.");
  }
  return value;
}
