import type { DecodedResult } from "./xdrDecoder";

export type FeeBumpSplit = {
  outerCode: string;
  innerCode: string;
  outerFeeChargedStroops: string;
  innerFeeChargedStroops: string;
  innerHash: string;
};

/** Keep the fee-bump wrapper and the inner transaction as two results. */
export function splitFeeBump(decoded: DecodedResult): FeeBumpSplit | null {
  if (!decoded.feeBump) return null;
  return {
    outerCode: decoded.feeBump.outerCode,
    innerCode: decoded.feeBump.innerCode,
    outerFeeChargedStroops: decoded.feeChargedStroops,
    innerFeeChargedStroops: decoded.feeBump.innerFeeChargedStroops,
    innerHash: decoded.feeBump.innerHash,
  };
}
