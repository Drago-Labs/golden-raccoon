/**
 * Public entry point for incident-status evidence.
 *
 * `analyseIncidentStatus` is pure. It reads documents the caller already holds
 * and returns an inspectable chronology. It changes no news score, fetches no
 * URL, and never claims a provider verified a patch.
 */
import { adaptDocument } from "./adapter";
import { buildCoverage } from "./coverage";
import { findDisagreements } from "./disagreements";
import { buildSubject } from "./identity";
import { assignProvenance } from "./provenance";
import {
  INCIDENT_SCHEMA_VERSION,
  IncidentError,
  incidentRequestSchema,
  type IncidentReport,
} from "./schema";
import { buildTimeline, buildTransitions } from "./transitions";

export function analyseIncidentStatus(input: unknown): IncidentReport {
  const parsed = incidentRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new IncidentError("invalid_request", "The incident-status request could not be read.", parsed.error.flatten());
  }

  const observedAtMs = Date.parse(parsed.data.observedAt);

  if (!Number.isFinite(observedAtMs)) {
    throw new IncidentError("invalid_observed_at", "The observation time could not be read.");
  }

  const subject = buildSubject(parsed.data.subject);
  const adapted = parsed.data.documents.map((document) =>
    adaptDocument(document, parsed.data.subject, observedAtMs, parsed.data.staleAfterSeconds),
  );
  const documents = assignProvenance(adapted);
  const disagreements = findDisagreements(documents);
  const transitions = buildTransitions(documents);
  const timeline = buildTimeline(documents);

  return {
    schemaVersion: INCIDENT_SCHEMA_VERSION,
    observedAt: new Date(observedAtMs).toISOString(),
    subject,
    documents,
    transitions,
    timeline,
    disagreements,
    coverage: buildCoverage(documents, disagreements),
    scoreUnchanged: true,
  };
}

export { IncidentError } from "./schema";
export type { IncidentReport } from "./schema";
