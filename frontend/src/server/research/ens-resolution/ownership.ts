import type { RecordedEnsSnapshot } from "./registryReader";
import type { OwnershipEvidence } from "./schema";

export function extractOwnershipEvidence(snapshot: RecordedEnsSnapshot): OwnershipEvidence {
  const expired =
    snapshot.expiresAtTimestamp !== null &&
    snapshot.recordedTimestamp > snapshot.expiresAtTimestamp;
  return {
    registrant: snapshot.registrant,
    controller: snapshot.controller,
    nameWrapperWrapped: snapshot.nameWrapperWrapped,
    expiresAtTimestamp: snapshot.expiresAtTimestamp,
    expiredAtRecordedTime: expired,
  };
}
