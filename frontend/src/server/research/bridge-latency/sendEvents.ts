import type { BridgeMessage } from "./schema";
export function readSends(value: unknown): BridgeMessage[] {
  if (!Array.isArray(value)) return [];
  const rows: BridgeMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.route !== "string" || typeof row.tx !== "string") continue;
    if (typeof row.sentAt !== "number" || typeof row.bridge !== "string") continue;
    rows.push({
      id: row.id, route: row.route, sentAt: row.sentAt, tx: row.tx, bridge: row.bridge,
      format: typeof row.format === "string" ? row.format : undefined,
    });
  }
  return rows;
}
