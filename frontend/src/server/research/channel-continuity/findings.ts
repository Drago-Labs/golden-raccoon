/**
 * Findings derived from continuity events.
 *
 * Findings restate evidence. They never elevate a ticker match into an
 * "official" channel claim, and they never score takeover or fraud risk.
 */
import type { ChannelObservation, ContinuityEvent, ContinuityFinding } from "./schema";

const CHANGE_LIMITATION =
  "This is observed evidence of a channel change. It does not establish takeover, impersonation, or fraud, and it does not declare any channel official.";

const UNCERTAINTY_LIMITATION =
  "Ticker or branding similarity is not identity. Ambiguous and user-supplied claims stay labelled as such.";

export function buildFindings(
  observations: ChannelObservation[],
  events: ContinuityEvent[],
  analysableCount: number,
): ContinuityFinding[] {
  const findings: ContinuityFinding[] = [];

  if (analysableCount === 0) {
    findings.push({
      findingId: "insufficient-evidence",
      kind: "insufficient_evidence",
      strength: "insufficient_evidence",
      measurement:
        "No analysable channel observation was available. Absence of a continuity event here is absence of evidence, not evidence of absence.",
      supportingObservationIds: observations.map((observation) => observation.observationId),
      limitation: CHANGE_LIMITATION,
    });
    return findings;
  }

  const byKind = new Map<string, ContinuityEvent[]>();
  for (const event of events) {
    const bucket = byKind.get(event.kind) ?? [];
    bucket.push(event);
    byKind.set(event.kind, bucket);
  }

  for (const [kind, kindEvents] of byKind) {
    findings.push({
      findingId: `finding:${kind}`,
      kind: kind as ContinuityFinding["kind"],
      strength: "observed",
      measurement: `${kindEvents.length} ${kind.replace(/_/g, " ")} event${kindEvents.length === 1 ? "" : "s"} across the supplied observations.`,
      supportingObservationIds: [...new Set(kindEvents.map((event) => event.toObservationId))],
      limitation: CHANGE_LIMITATION,
    });
  }

  const uncertain = observations.filter(
    (observation) => observation.claimKind === "ambiguous" || observation.claimKind === "user_supplied",
  );

  if (uncertain.length > 0) {
    findings.push({
      findingId: "finding:identity-uncertainty",
      kind: "identity_uncertainty",
      strength: "observed",
      measurement: `${uncertain.length} observation${uncertain.length === 1 ? "" : "s"} remain ambiguous or user-supplied and are not treated as official project channels.`,
      supportingObservationIds: uncertain.map((observation) => observation.observationId),
      limitation: UNCERTAINTY_LIMITATION,
    });
  }

  return findings;
}
