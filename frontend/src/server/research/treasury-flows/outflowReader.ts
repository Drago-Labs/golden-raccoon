import type { Outflow } from "./schema";
export function readOutflows(value: unknown): Outflow[] {
  if (!Array.isArray(value)) return [];
  const rows: Outflow[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.destination !== "string" || typeof row.amount !== "string") continue;
    if (typeof row.asset !== "string" || typeof row.chain !== "string" || typeof row.time !== "number") continue;
    rows.push({
      time: row.time, asset: row.asset, chain: row.chain, amount: row.amount, destination: row.destination,
      label: typeof row.label === "string" ? row.label : undefined,
    });
  }
  return rows;
}
