import type { ReserveSnapshot } from "./schema";
import { decimalMultiply, decimalSubtract } from "./decimalMath";

export function calculateFeeIncome(
  reserves: ReserveSnapshot[],
  shareBalance: string,
): string {
  if (reserves.length < 2) return "0";

  const initialReserve = reserves[0];
  const finalReserve = reserves[reserves.length - 1];

  // Fee income comes from reserve growth beyond proportional growth
  // This is a simplified calculation - actual implementation would track
  // all trade fees accumulated during the window
  const shareRatio = decimalMultiply(shareBalance, "1");
  const initialValue = decimalMultiply(initialReserve.reserveA, shareRatio);
  const finalValue = decimalMultiply(finalReserve.reserveA, shareRatio);

  const growth = decimalSubtract(finalValue, initialValue);
  
  // Approximate fee income as a portion of growth
  return decimalMultiply(growth, "0.003"); // 0.3% fee assumption
}
