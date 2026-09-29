/**
 * Run a bounded provider-contract probe suite over caller-supplied fixtures.
 *
 * Live mode still operates on payloads the caller already collected — this
 * module never dials a provider itself, so credentials stay out of artifacts.
 */
import { comparePayload } from "./compare";
import { CONTRACT_VERSIONS } from "./contracts";
import { redactValue } from "./redact";
import {
  DRIFT_SCHEMA_VERSION,
  DriftError,
  driftRequestSchema,
  type DriftReport,
} from "./schema";

export function analyseProviderDrift(input: unknown): DriftReport {
  const parsed = driftRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new DriftError("invalid_request", "The provider-drift request could not be read.", parsed.error.flatten());
  }

  const observedAtMs = Date.parse(parsed.data.observedAt);
  if (!Number.isFinite(observedAtMs)) {
    throw new DriftError("invalid_observed_at", "The observation time could not be read.");
  }

  const observedAt = new Date(observedAtMs).toISOString();
  const findings = [];
  const artifacts = [];

  for (const probe of parsed.data.probes) {
    const observed = probe.available ? (probe.observed ?? null) : null;
    // Secrets are stripped before compare; wallet identifiers are scrubbed only
    // in retained artifacts so contract identity checks still work.
    const forCompareObserved = observed ? redactValue(observed, { scrubWallets: false }) : { value: null, droppedKeys: [], droppedWalletLike: 0 };
    const forCompareBaseline = redactValue(probe.baseline, { scrubWallets: false });
    const artifactObserved = observed ? redactValue(observed, { scrubWallets: true }) : { value: null, droppedKeys: [], droppedWalletLike: 0 };
    const artifactBaseline = redactValue(probe.baseline, { scrubWallets: true });

    findings.push(
      ...comparePayload({
        provider: probe.provider,
        baseline: forCompareBaseline.value,
        observed: forCompareObserved.value,
        available: probe.available,
        flaky: probe.flaky,
      }),
    );

    artifacts.push({
      provider: probe.provider,
      contractVersion: CONTRACT_VERSIONS[probe.provider],
      observedAt,
      redactedPayload: artifactObserved.value,
      droppedKeys: [...new Set([...artifactBaseline.droppedKeys, ...artifactObserved.droppedKeys])],
      droppedWalletLike: artifactBaseline.droppedWalletLike + artifactObserved.droppedWalletLike,
    });
  }

  const summaryCounts = {
    breaking: findings.filter((finding) => finding.classification === "breaking").length,
    additive: findings.filter((finding) => finding.classification === "additive").length,
    unavailable: findings.filter((finding) => finding.classification === "unavailable").length,
    inconclusive: findings.filter((finding) => finding.classification === "inconclusive").length,
    unchanged: findings.filter((finding) => finding.classification === "unchanged").length,
  };

  return {
    schemaVersion: DRIFT_SCHEMA_VERSION,
    observedAt,
    mode: parsed.data.mode,
    findings,
    artifacts,
    summary: {
      ...summaryCounts,
      note:
        summaryCounts.breaking > 0
          ? "Breaking contract drift detected; do not consume these responses for scores until triage."
          : summaryCounts.unavailable > 0
            ? "One or more probes were unavailable — treated as failed contracts, not passes."
            : "No breaking drift in this replay.",
    },
  };
}

export { DriftError } from "./schema";
export type { DriftReport } from "./schema";
