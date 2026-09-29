/**
 * Per-venue capacity summary: how much the snapshot actually shows, and what a
 * reader must accept for those numbers to mean anything.
 */
import { formatPrice } from "./amountMath";
import type { NormalizedLevel } from "./orderbookAdapter";
import type { LadderRung, VenueSnapshot } from "./schema";

export function visibleDepth(levels: NormalizedLevel[]): bigint {
  return levels.reduce((sum, level) => sum + level.baseAmount, 0n);
}

export function bestVisiblePrice(levels: NormalizedLevel[]): string | null {
  return levels[0] ? formatPrice(levels[0].scaledPrice) : null;
}

/**
 * Assumptions for an order-book analysis. They are returned as data rather than
 * baked into UI copy so the endpoint's consumers see them too.
 */
export function orderBookAssumptions(venue: VenueSnapshot): string[] {
  return [
    "Depth is read from the levels present in this snapshot. Nothing is extrapolated from headline liquidity.",
    `A fee of ${venue.feeBps} basis points is applied to the taker's proceeds.`,
    "Levels are assumed to be independent resting orders that do not move while the ladder is walked.",
    "No route aggregation is performed: this is one venue in isolation.",
  ];
}

export function poolAssumptions(venue: VenueSnapshot): string[] {
  return [
    "Depth is derived analytically from the pool reserves using the constant-product invariant. These are modelled figures, not observed orders.",
    `A fee of ${venue.feeBps} basis points is taken on the input, in the Uniswap-style convention.`,
    "The reserves are assumed unchanged for the duration of the trade, with no concurrent activity and no external arbitrage.",
    "No route aggregation is performed: this is one venue in isolation.",
  ];
}

/**
 * Reasons the analysis is qualified. An empty array means nothing about the
 * snapshot undermines the numbers above it.
 */
export function qualifications(venue: VenueSnapshot, nowMs: number, staleAfterSeconds: number): string[] {
  const reasons: string[] = [];
  const observed = Date.parse(venue.observedAt);

  if (!Number.isFinite(observed)) {
    reasons.push("The snapshot carries no readable observation time, so its age cannot be established.");
  } else {
    const ageSeconds = Math.floor((nowMs - observed) / 1_000);
    if (ageSeconds > staleAfterSeconds) {
      reasons.push(
        `This snapshot is ${ageSeconds} seconds old, beyond the ${staleAfterSeconds}-second freshness bound. Depth may have moved since it was taken.`,
      );
    }
  }

  if (venue.truncated) {
    reasons.push(
      "The source reported more data than it returned. Capacity beyond the last visible level is unknown, not absent.",
    );
  }

  if (venue.ledgerOrBlock === null) {
    reasons.push("The source did not report a ledger or block, so this snapshot cannot be pinned to a chain position.");
  }

  return reasons;
}

/** Total base-unit capacity the ladder could actually size against. */
export function fillableCapacity(ladder: LadderRung[]): bigint {
  return ladder.reduce((max, rung) => {
    const fillable = BigInt(rung.fillableBaseAmount);
    return fillable > max ? fillable : max;
  }, 0n);
}
