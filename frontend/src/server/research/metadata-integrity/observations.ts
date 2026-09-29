/**
 * Comparable metadata observations: hashes, timelines, and field diffs.
 *
 * A change between two observations is reported as a change. It is never
 * labelled fraud, risk, or illegitimacy.
 */
import { createHash } from "node:crypto";
import type {
  DeclarationStatus,
  MetadataObservation,
  MetadataSnapshot,
  ObservationDiff,
  ObservationDiffRow,
  ObservationFieldKey,
  StellarNetworkShort,
  TomlFetchOutcome,
} from "./schema";

const DIFF_FIELDS: ObservationFieldKey[] = [
  "name",
  "description",
  "orgUrl",
  "image",
  "status",
  "code",
  "issuer",
  "homeDomain",
  "tomlUrl",
];

export function hashSnapshot(snapshot: MetadataSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function buildObservation(input: {
  observationId: string;
  observedAt: string;
  identityKey: string;
  network: StellarNetworkShort;
  assetCode: string;
  issuer: string;
  issuerLedgerRef: MetadataObservation["issuerLedgerRef"];
  declarationStatus: DeclarationStatus;
  fetchOutcome: TomlFetchOutcome;
  exactLinks: MetadataObservation["exactLinks"];
  snapshot: MetadataSnapshot;
  notes: string[];
}): MetadataObservation {
  return {
    observationId: input.observationId,
    observedAt: input.observedAt,
    contentHash: hashSnapshot(input.snapshot),
    identityKey: input.identityKey,
    network: input.network,
    assetCode: input.assetCode,
    issuer: input.issuer,
    issuerLedgerRef: input.issuerLedgerRef,
    declarationStatus: input.declarationStatus,
    fetchOutcome: input.fetchOutcome,
    exactLinks: input.exactLinks,
    snapshot: input.snapshot,
    domainOwnershipClaimed: false,
    notes: input.notes,
  };
}

export function sortTimeline(observations: MetadataObservation[]): MetadataObservation[] {
  return [...observations].sort((left, right) => {
    const leftMs = Date.parse(left.observedAt);
    const rightMs = Date.parse(right.observedAt);
    if (leftMs !== rightMs) return leftMs - rightMs;
    return left.observationId.localeCompare(right.observationId);
  });
}

function snapshotValue(snapshot: MetadataSnapshot, field: ObservationFieldKey): string | null {
  return snapshot[field];
}

export function diffObservations(previous: MetadataObservation, current: MetadataObservation): ObservationDiff {
  const rows: ObservationDiffRow[] = DIFF_FIELDS.map((field) => {
    const from = snapshotValue(previous.snapshot, field);
    const to = snapshotValue(current.snapshot, field);

    return {
      field,
      previous: from,
      current: to,
      changed: from !== to,
    };
  });

  return {
    fromObservationId: previous.observationId,
    toObservationId: current.observationId,
    fromObservedAt: previous.observedAt,
    toObservedAt: current.observedAt,
    rows,
    changeIsObservationNotFraud: true,
  };
}

export function buildDiffs(timeline: MetadataObservation[]): ObservationDiff[] {
  const diffs: ObservationDiff[] = [];

  for (let index = 1; index < timeline.length; index += 1) {
    diffs.push(diffObservations(timeline[index - 1], timeline[index]));
  }

  return diffs;
}

/** Keep only prior observations that share the same network-scoped identity. */
export function filterPriorForIdentity(
  priors: MetadataObservation[],
  identityKey: string,
): MetadataObservation[] {
  return priors.filter((observation) => observation.identityKey === identityKey);
}
