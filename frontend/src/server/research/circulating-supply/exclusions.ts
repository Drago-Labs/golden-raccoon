import type { CirculatingSupplyRequest, SupplySnapshot } from "./schema";
import { normalizeHolder } from "./tokenIdentity";
export function resolveExclusions(input: CirculatingSupplyRequest, snapshot: SupplySnapshot) {
  return input.exclusions.map((item) => ({ ...item, address: normalizeHolder(input.token, item.address), balance: snapshot.balances[normalizeHolder(input.token, item.address)] ?? "0" }));
}
export function excludedTotal(items: Array<{ balance: string }>): string { return items.reduce((sum, item) => sum + BigInt(item.balance), 0n).toString(); }
