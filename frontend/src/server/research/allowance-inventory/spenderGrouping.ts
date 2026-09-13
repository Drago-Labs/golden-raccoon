import type { InventoryEntry, SpenderGroup } from "./schema";

export function groupBySpender(entries: InventoryEntry[]): SpenderGroup[] {
  const groups = new Map<string, InventoryEntry[]>();
  for (const entry of entries) groups.set(entry.spender, [...(groups.get(entry.spender) ?? []), entry]);
  return [...groups.entries()].map(([spender, values]) => ({
    spender,
    activeCount: values.filter((entry) => entry.allowanceKind === "finite" || entry.allowanceKind === "maximum").length,
    revokedCount: values.filter((entry) => entry.allowanceKind === "revoked").length,
    entries: values.sort((a, b) => (a.symbol ?? a.token).localeCompare(b.symbol ?? b.token)),
  })).sort((a, b) => b.activeCount - a.activeCount || a.spender.localeCompare(b.spender));
}
