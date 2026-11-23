import type { BridgeMessage, Delivery, MatchedTransfer } from "./schema";
export function matchTransfers(sends: BridgeMessage[], deliveries: Delivery[]): { matched: MatchedTransfer[]; unmatched: BridgeMessage[] } {
  const byId = new Map(deliveries.map((row) => [row.id, row]));
  const matched: MatchedTransfer[] = [];
  const unmatched: BridgeMessage[] = [];
  for (const send of sends) {
    const delivery = byId.get(send.id);
    if (!delivery) { unmatched.push(send); continue; }
    matched.push({ id: send.id, route: send.route, bridge: send.bridge, tx: send.tx, latencySeconds: delivery.deliveredAt - send.sentAt });
  }
  return { matched, unmatched };
}
