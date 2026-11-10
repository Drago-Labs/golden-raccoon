import { VOLATILITY_PROFILE_LIMITS } from "./limits";
import type { PriceObservation } from "./schema";

export function normalizeObservations(observations: PriceObservation[]): PriceObservation[] {
  const byTs = new Map<number, number>();
  for (const obs of observations.slice(0, VOLATILITY_PROFILE_LIMITS.maxPoints)) {
    if (Number.isFinite(obs.timestamp) && Number.isFinite(obs.price) && obs.price > 0) {
      byTs.set(obs.timestamp, obs.price);
    }
  }
  return Array.from(byTs.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([timestamp, price]) => ({ timestamp, price }));
}
