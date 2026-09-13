import type { LabRequest } from "./schema";
export function orderObservations(items: LabRequest["observations"]) {
  const outOfOrder = items.some((item, index) => index > 0 && item.observedAt < items[index - 1].observedAt);
  return { items: [...items].sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id)), outOfOrder };
}
