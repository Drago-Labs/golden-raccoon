/**
 * Walks a size ladder against a venue and reports what each size costs.
 *
 * The distinction this module keeps is between *filled*, *partial* and
 * *insufficient depth*. A ladder rung larger than the visible book is never
 * quietly clamped to the book's total: it is returned with the fillable portion
 * and a status saying the rest is not visible.
 */
import { applyFeeBps, effectivePrice, formatPrice, priceImpactBps, quoteForBase } from "./amountMath";
import { poolOutputFor } from "./depthCurve";
import type { NormalizedLevel } from "./orderbookAdapter";
import type { NormalizedPool } from "./poolAdapter";
import type { LadderRung } from "./schema";

export function walkOrderBook(
  levels: NormalizedLevel[],
  ladder: bigint[],
  side: "buy_base" | "sell_base",
  feeBps: number,
  baseDecimals: number,
  quoteDecimals: number,
): LadderRung[] {
  const bestPrice = levels[0]?.scaledPrice ?? null;

  return ladder.map((requested) => {
    let remaining = requested;
    let filledBase = 0n;
    let grossQuote = 0n;

    for (const level of levels) {
      if (remaining <= 0n) break;

      const take = remaining < level.baseAmount ? remaining : level.baseAmount;
      filledBase += take;
      grossQuote += quoteForBase(take, level.scaledPrice, baseDecimals, quoteDecimals);
      remaining -= take;
    }

    if (filledBase === 0n) {
      return {
        requestedBaseAmount: requested.toString(),
        fillableBaseAmount: "0",
        quoteAmount: null,
        effectivePrice: null,
        priceImpactBps: null,
        feeBps,
        status: "insufficient_depth" as const,
        note: "The visible book carries no depth on this side, so no part of this size can be sized from the snapshot.",
      };
    }

    const netQuote = applyFeeBps(grossQuote, feeBps);
    const effective = effectivePrice(filledBase, netQuote, baseDecimals, quoteDecimals);
    const filled = remaining === 0n;

    return {
      requestedBaseAmount: requested.toString(),
      fillableBaseAmount: filledBase.toString(),
      quoteAmount: netQuote.toString(),
      effectivePrice: effective === null ? null : formatPrice(effective),
      priceImpactBps: effective !== null && bestPrice !== null ? priceImpactBps(effective, bestPrice, side) : null,
      feeBps,
      status: filled ? ("filled" as const) : ("partial" as const),
      note: filled
        ? "The visible book covers this size."
        : `Only ${filledBase} of ${requested} base units are visible in this snapshot. The remainder is not depth the venue lacks — it is depth this snapshot does not show.`,
    };
  });
}

export function walkPool(
  pool: NormalizedPool,
  ladder: bigint[],
  side: "buy_base" | "sell_base",
  feeBps: number,
  baseDecimals: number,
  quoteDecimals: number,
  spotPrice: bigint,
): LadderRung[] {
  return ladder.map((requested) => {
    const output = poolOutputFor(pool, requested, side, feeBps);

    if (output === null) {
      return {
        requestedBaseAmount: requested.toString(),
        fillableBaseAmount: "0",
        quoteAmount: null,
        effectivePrice: null,
        priceImpactBps: null,
        feeBps,
        status: "insufficient_depth" as const,
        note: "A constant-product pool cannot release its whole base reserve, so this size is unreachable on this curve at any price.",
      };
    }

    const effective = effectivePrice(requested, output, baseDecimals, quoteDecimals);

    return {
      requestedBaseAmount: requested.toString(),
      fillableBaseAmount: requested.toString(),
      quoteAmount: output.toString(),
      effectivePrice: effective === null ? null : formatPrice(effective),
      priceImpactBps: effective === null ? null : priceImpactBps(effective, spotPrice, side),
      feeBps,
      status: "filled" as const,
      note: "Derived analytically from the pool reserves and fee. This is a model of the curve, not an observed order.",
    };
  });
}

/** Rungs for a venue whose mechanics this feature does not implement. */
export function notModelled(ladder: bigint[], feeBps: number, model: string): LadderRung[] {
  return ladder.map((requested) => ({
    requestedBaseAmount: requested.toString(),
    fillableBaseAmount: "0",
    quoteAmount: null,
    effectivePrice: null,
    priceImpactBps: null,
    feeBps,
    status: "not_modelled" as const,
    note: `This venue reports a "${model}" model, which this workbench does not implement. No depth is claimed for it.`,
  }));
}
