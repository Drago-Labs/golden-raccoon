import { array, boolean, optional, shape, text } from "./validation.js";
import type { Transport } from "./transport.js";
import type { ReadOptions, WalletQuery } from "./types.js";
export const alertsSchema = shape({ alerts: array(shape({ id: text, walletAddress: text, kind: text, title: text, detail: text,
  severity: text, acknowledged: boolean, createdAt: text, entryId: optional(text), runId: optional(text) })) });
export type Alerts = ReturnType<typeof alertsSchema>;
export const alertsClient = (get: Transport) => ({ list: (query: WalletQuery, options?: ReadOptions) => get("/api/alerts", query, alertsSchema, options) });
