import type { Delivery } from "./schema";
export function readDeliveries(value: unknown): Delivery[] {
  if (!Array.isArray(value)) return [];
  const rows: Delivery[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.deliveredAt !== "number") continue;
    rows.push({ id: row.id, deliveredAt: row.deliveredAt });
  }
  return rows;
}
