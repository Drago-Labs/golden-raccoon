export type BridgeMessage = {
  id: string;
  route: string;
  sentAt: number;
  tx: string;
  bridge: string;
  format?: string;
};
export type Delivery = { id: string; deliveredAt: number };
export type MatchedTransfer = { id: string; route: string; bridge: string; latencySeconds: number; tx: string };
export type StuckTransfer = { id: string; route: string; bridge: string; tx: string; ageSeconds: number };
export type RouteLatency = { route: string; count: number; p50: number; p95: number };
export type BridgeReport = {
  bridge: string;
  routes: RouteLatency[];
  stuck: StuckTransfer[];
  matched: number;
  coverage: { notes: string[] };
};
