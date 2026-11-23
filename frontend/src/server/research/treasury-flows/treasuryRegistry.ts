export type TreasuryAddress = { chain: string; address: string; source: string };
export function readTreasuryAddresses(value: unknown): TreasuryAddress[] {
  if (!Array.isArray(value)) return [];
  const rows: TreasuryAddress[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.chain !== "string" || typeof row.address !== "string" || typeof row.source !== "string") continue;
    if (row.address.trim() === "") continue;
    rows.push({ chain: row.chain, address: row.address, source: row.source });
  }
  return rows;
}
