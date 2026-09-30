import type { RoundInput } from "./schema";

/**
 * The latest round at or before `atIso`, never a future one. Interpolating
 * across rounds — or picking whichever is closest in either direction —
 * would let a stale or not-yet-effective price masquerade as the value in
 * force at `atIso`.
 */
export function latestRoundAtOrBefore(rounds: RoundInput[], atIso: string): RoundInput | null {
  const atMs = Date.parse(atIso);
  let best: RoundInput | null = null;
  let bestMs = -Infinity;

  for (const round of rounds) {
    const roundMs = Date.parse(round.updatedAt);
    if (roundMs > atMs) continue;
    if (roundMs > bestMs) {
      best = round;
      bestMs = roundMs;
    }
  }

  return best;
}
