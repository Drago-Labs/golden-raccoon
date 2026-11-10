import type { PricePoint } from "./schema";
import { computeReturnMap } from "./priceSeries";

export type AlignedReturnPair = {
  timestamps: number[];
  returnsA: number[];
  returnsB: number[];
};

/**
 * Aligns two return series strictly by matching timestamps. Non-overlapping
 * timestamps are dropped rather than shifted or interpolated.
 */
export function alignReturnSeries(pointsA: PricePoint[], pointsB: PricePoint[]): AlignedReturnPair {
  const mapA = computeReturnMap(pointsA);
  const mapB = computeReturnMap(pointsB);

  const timestamps: number[] = [];
  const returnsA: number[] = [];
  const returnsB: number[] = [];

  const sortedTs = Array.from(mapA.keys()).sort((a, b) => a - b);
  for (const ts of sortedTs) {
    const bVal = mapB.get(ts);
    if (bVal !== undefined) {
      timestamps.push(ts);
      returnsA.push(mapA.get(ts)!);
      returnsB.push(bVal);
    }
  }

  return { timestamps, returnsA, returnsB };
}
