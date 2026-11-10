import type { RecordedEnsSnapshot } from "./registryReader";
import type { ReverseResolutionStep } from "./schema";

export function extractReverseStep(snapshot: RecordedEnsSnapshot): ReverseResolutionStep {
  return {
    queriedAddress: snapshot.queriedAddress ?? snapshot.forwardAddress,
    reverseName: snapshot.reverseName,
    reverseForwardAddress: snapshot.reverseForwardAddress,
    blockNumber: snapshot.recordedBlock,
  };
}
