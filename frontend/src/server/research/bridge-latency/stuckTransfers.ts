import type { BridgeMessage, StuckTransfer } from "./schema";
export function stuckTransfers(unmatched: BridgeMessage[], now: number, thresholdSeconds: number): StuckTransfer[] {
  return unmatched
    .map((send) => ({ id: send.id, route: send.route, bridge: send.bridge, tx: send.tx, ageSeconds: now - send.sentAt }))
    .filter((row) => row.ageSeconds > thresholdSeconds);
}
