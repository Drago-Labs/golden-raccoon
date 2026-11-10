import type { RecordedEnsSnapshot } from "./registryReader";
import type { ForwardResolutionStep } from "./schema";

export function extractForwardStep(snapshot: RecordedEnsSnapshot): ForwardResolutionStep {
  return {
    normalizedName: snapshot.normalizedName,
    registryResolver: snapshot.registryResolver,
    forwardAddress: snapshot.forwardAddress,
    blockNumber: snapshot.recordedBlock,
  };
}
