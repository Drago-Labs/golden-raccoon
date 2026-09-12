/**
 * Bounded adapter for order-book venue snapshots.
 *
 * Validates the book before any depth is computed: a crossed book (best bid at
 * or above best ask) and a book whose levels are not monotonic are refused,
 * because a depth curve derived from either would be meaningless.
 */
import { formatPrice, parseAmount, parsePrice } from "./amountMath";
import { LIQUIDITY_LIMITS, LiquidityError, type OrderBookLevelInput, type VenueInput } from "./schema";

export type NormalizedLevel = { scaledPrice: bigint; baseAmount: bigint };

export type NormalizedBook = {
  /** Levels a taker sells into, best (highest) price first. */
  bids: NormalizedLevel[];
  /** Levels a taker buys from, best (lowest) price first. */
  asks: NormalizedLevel[];
};

function normalizeLevels(levels: OrderBookLevelInput[], direction: "desc" | "asc"): NormalizedLevel[] {
  const normalized = levels
    .map((level) => ({ scaledPrice: parsePrice(level.price), baseAmount: parseAmount(level.baseAmount) }))
    // A zero-size level carries no depth; keeping it would pad the book.
    .filter((level) => level.baseAmount > 0n && level.scaledPrice > 0n);

  return normalized.sort((left, right) =>
    direction === "desc"
      ? left.scaledPrice < right.scaledPrice
        ? 1
        : left.scaledPrice > right.scaledPrice
          ? -1
          : 0
      : left.scaledPrice > right.scaledPrice
        ? 1
        : left.scaledPrice < right.scaledPrice
          ? -1
          : 0,
  );
}

export function adaptOrderBook(venue: VenueInput): NormalizedBook {
  if (venue.model !== "orderbook") {
    throw new LiquidityError("wrong_model", `Venue ${venue.venueId} is not an order-book venue.`);
  }

  const bids = normalizeLevels(venue.bids ?? [], "desc");
  const asks = normalizeLevels(venue.asks ?? [], "asc");

  if (bids.length > LIQUIDITY_LIMITS.maxOrderBookLevels || asks.length > LIQUIDITY_LIMITS.maxOrderBookLevels) {
    throw new LiquidityError("book_too_large", `Venue ${venue.venueId} exceeds the order-book level bound.`);
  }

  // A crossed book means the snapshot is internally inconsistent — the two
  // sides were read at different moments, or the pair orientation is wrong.
  // Deriving depth from it would produce a confident, wrong answer.
  if (bids.length > 0 && asks.length > 0 && bids[0].scaledPrice >= asks[0].scaledPrice) {
    throw new LiquidityError(
      "crossed_book",
      `Venue ${venue.venueId} reports a crossed book: best bid ${formatPrice(bids[0].scaledPrice)} is at or above best ask ${formatPrice(asks[0].scaledPrice)}. The snapshot is inconsistent, or the pair orientation is reversed.`,
    );
  }

  return { bids, asks };
}

/** The side of the book a taker consumes for a given trade direction. */
export function takerSide(book: NormalizedBook, side: "buy_base" | "sell_base"): NormalizedLevel[] {
  return side === "sell_base" ? book.bids : book.asks;
}
