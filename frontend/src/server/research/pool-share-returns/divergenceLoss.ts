import { decimalSubtract, decimalAdd } from "./decimalMath";

export function calculateDivergenceLoss(
  holdValue: string,
  poolValue: string,
  feeIncome: string,
): string {
  // Divergence loss = (hold value) - (pool value) - (fee income)
  // If negative, it means pool outperformed hold (no actual loss)
  const poolValueWithFees = decimalAdd(poolValue, feeIncome);
  const loss = decimalSubtract(holdValue, poolValueWithFees);
  
  return loss;
}
