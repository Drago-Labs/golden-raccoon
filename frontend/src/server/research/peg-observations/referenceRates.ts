/**
 * Currency conversion against timestamped rates.
 *
 * Conversion happens only when a rate for the exact pair exists at or before
 * the observation and within the tolerance. Nothing is interpolated, no
 * cross-rate is synthesised through a third currency, and a missing rate leaves
 * the observation explicitly unconverted rather than producing a number.
 */
import { divide, multiply, parseDecimal } from "./deviations";
import type { ReferenceRateInput } from "./schema";

export type RateIndex = {
  /**
   * Converts `amount` from `from` to `to` as of `atMs`. Returns the converted
   * value and the rate's source, or a reason it could not be done.
   */
  convert: (
    amount: bigint,
    from: string,
    to: string,
    atMs: number,
  ) => { value: bigint; sourceLabel: string } | { value: null; reason: string };
};

type IndexedRate = { atMs: number; rate: bigint; sourceLabel: string };

function key(from: string, to: string): string {
  return `${from.trim().toUpperCase()}->${to.trim().toUpperCase()}`;
}

export function buildRateIndex(rates: ReferenceRateInput[], toleranceSeconds: number): RateIndex {
  const byPair = new Map<string, IndexedRate[]>();

  for (const rate of rates) {
    const atMs = Date.parse(rate.observedAt);
    if (!Number.isFinite(atMs)) continue;

    const entry = { atMs, rate: parseDecimal(rate.rate), sourceLabel: rate.sourceLabel };
    const forward = key(rate.from, rate.to);
    const bucket = byPair.get(forward);
    if (bucket) bucket.push(entry);
    else byPair.set(forward, [entry]);
  }

  for (const bucket of byPair.values()) {
    bucket.sort((left, right) => left.atMs - right.atMs);
  }

  function lookup(from: string, to: string, atMs: number): IndexedRate | null {
    const bucket = byPair.get(key(from, to));
    if (!bucket) return null;

    // Most recent rate at or before the observation. Using a later rate would
    // let a future price explain a past deviation.
    let match: IndexedRate | null = null;
    for (const entry of bucket) {
      if (entry.atMs > atMs) break;
      match = entry;
    }

    if (!match) return null;
    if (atMs - match.atMs > toleranceSeconds * 1_000) return null;

    return match;
  }

  return {
    convert(amount, from, to, atMs) {
      const normalizedFrom = from.trim().toUpperCase();
      const normalizedTo = to.trim().toUpperCase();

      if (normalizedFrom === normalizedTo) {
        return { value: amount, sourceLabel: "identity" };
      }

      const direct = lookup(normalizedFrom, normalizedTo, atMs);
      if (direct) return { value: multiply(amount, direct.rate), sourceLabel: direct.sourceLabel };

      const inverse = lookup(normalizedTo, normalizedFrom, atMs);
      if (inverse && inverse.rate > 0n) {
        return { value: divide(amount, inverse.rate), sourceLabel: `${inverse.sourceLabel} (inverted)` };
      }

      return {
        value: null,
        reason: `No ${normalizedFrom}→${normalizedTo} rate was available at or before this observation within the ${toleranceSeconds}-second tolerance. The observation is shown in its own currency and no deviation is derived.`,
      };
    },
  };
}
