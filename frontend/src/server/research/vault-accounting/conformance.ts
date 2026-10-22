import type { VaultConformance, VaultFunctionName } from "./schema";

/**
 * Determines whether a target exposes the full read surface this feature
 * relies on. A function is "missing" when its call reverted or returned
 * nothing decodable — both are reported identically to the caller, since
 * neither can be distinguished reliably over raw JSON-RPC.
 */
export function assessConformance(reads: {
  asset: unknown;
  totalAssets: unknown;
  totalSupply: unknown;
  previewDepositAvailable: boolean;
  convertToAssetsAvailable: boolean;
  previewRedeemAvailable: boolean;
}): VaultConformance {
  const missing: VaultFunctionName[] = [];
  if (reads.asset === null || reads.asset === undefined) missing.push("asset");
  if (reads.totalAssets === null || reads.totalAssets === undefined) missing.push("totalAssets");
  if (reads.totalSupply === null || reads.totalSupply === undefined) missing.push("totalSupply");
  if (!reads.convertToAssetsAvailable) missing.push("convertToAssets");
  if (!reads.previewDepositAvailable) missing.push("previewDeposit");
  if (!reads.previewRedeemAvailable) missing.push("previewRedeem");
  return { conforming: missing.length === 0, missing };
}
