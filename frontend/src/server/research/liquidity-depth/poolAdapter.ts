/**
 * Adapter for constant-product pool venues.
 *
 * Only the `x * y = k` model is implemented. A venue declaring any other model
 * is passed through as `unsupported_model` and analysed by nobody — the report
 * says so rather than approximating it with maths that does not apply.
 */
import { PRICE_SCALE, parseAmount, wholeUnit } from "./amountMath";
import { LiquidityError, type VenueInput } from "./schema";

export type NormalizedPool = {
  baseReserve: bigint;
  quoteReserve: bigint;
};

export function adaptPool(venue: VenueInput): NormalizedPool {
  if (venue.model !== "constant_product") {
    throw new LiquidityError("wrong_model", `Venue ${venue.venueId} is not a constant-product venue.`);
  }

  if (venue.baseReserve === undefined || venue.quoteReserve === undefined) {
    throw new LiquidityError(
      "missing_reserves",
      `Venue ${venue.venueId} declares a constant-product model but supplied no reserves.`,
    );
  }

  const baseReserve = parseAmount(venue.baseReserve);
  const quoteReserve = parseAmount(venue.quoteReserve);

  // A pool with a zero reserve has no curve: `k` is zero and every trade would
  // divide by zero or return the whole of the other side.
  if (baseReserve === 0n || quoteReserve === 0n) {
    throw new LiquidityError(
      "zero_reserve",
      `Venue ${venue.venueId} reports a zero reserve (base ${baseReserve}, quote ${quoteReserve}). A constant-product curve is undefined for it.`,
    );
  }

  return { baseReserve, quoteReserve };
}

/**
 * Spot price of the pool: quote base units per one whole base unit, scaled to
 * `PRICE_SCALE`. This is the marginal price at zero size, which is the correct
 * reference for measuring a trade's price impact.
 */
export function poolSpotPrice(pool: NormalizedPool, baseDecimals: number, quoteDecimals: number): bigint {
  return (pool.quoteReserve * wholeUnit(baseDecimals) * PRICE_SCALE) / (pool.baseReserve * wholeUnit(quoteDecimals));
}
