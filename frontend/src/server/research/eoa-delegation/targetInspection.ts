import { knownImplementation } from "./knownImplementations";
export type TargetEvidence = { verifiedSource: boolean | null; functionNames: string[] };
export function inspectDelegationTarget(target: string, evidence: TargetEvidence) {
  const privilegedFunctions = evidence.functionNames.filter((name) => /execute|transfer|approve|upgrade|withdraw/i.test(name));
  return { implementation: knownImplementation(target), verifiedSource: evidence.verifiedSource, privilegedFunctions };
}
