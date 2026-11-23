import type { PricePoint, PositionSnapshot } from "./schema";
import { stroopsToDecimal, decimalMultiply, decimalAdd } from "./decimalMath";

export function calculateHoldValue(
  initialPosition: PositionSnapshot,
  initialPrices: PricePoint,
  finalPrices: PricePoint,
  shareOfPool: string,
): string {
  // Calculate initial asset amounts from share of pool
  const initialValueA = decimalMultiply(shareOfPool, initialPrices.priceA);
  const initialValueB = decimalMultiply(shareOfPool, initialPrices.priceB);

  // Calculate final value if assets were simply held
  const finalValueA = decimalMultiply(initialValueA, finalPrices.priceA);
  const finalValueB = decimalMultiply(initialValueB, finalPrices.priceB);

  return decimalAdd(finalValueA, finalValueB);
}
