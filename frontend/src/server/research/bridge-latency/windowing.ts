import type { BridgeMessage } from "./schema";
export function withinWindow(sends: BridgeMessage[], now: number, windowSeconds: number): BridgeMessage[] {
  return sends.filter((send) => now - send.sentAt <= windowSeconds);
}
