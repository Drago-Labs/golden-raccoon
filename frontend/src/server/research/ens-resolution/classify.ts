import type {
  EnsPairClassification,
  ForwardResolutionStep,
  OwnershipEvidence,
  ReverseResolutionStep,
} from "./schema";

export function classifyEnsResolution(input: {
  forward: ForwardResolutionStep;
  reverse: ReverseResolutionStep;
  ownership: OwnershipEvidence;
}): EnsPairClassification {
  if (input.ownership.expiredAtRecordedTime) {
    return "expired";
  }

  const fwdAddr = input.forward.forwardAddress?.toLowerCase() ?? null;
  const revName = input.reverse.reverseName?.toLowerCase() ?? null;
  const revFwdAddr = input.reverse.reverseForwardAddress?.toLowerCase() ?? null;
  const queriedAddr = input.reverse.queriedAddress?.toLowerCase() ?? null;
  const normName = input.forward.normalizedName.toLowerCase();

  if (fwdAddr && revName) {
    const namesMatch = revName === normName;
    const addressesMatch = (revFwdAddr ?? fwdAddr) === fwdAddr && (!queriedAddr || queriedAddr === fwdAddr);
    return namesMatch && addressesMatch ? "verified" : "mismatched";
  }

  if (fwdAddr && !revName) {
    return "forward_only";
  }

  if (!fwdAddr && revName) {
    if (revFwdAddr && queriedAddr && revFwdAddr !== queriedAddr) {
      return "mismatched";
    }
    return "reverse_only";
  }

  return "unresolved";
}
