/**
 * Findings.
 *
 * Every finding states three things separately: what was **measured**, the
 * published **threshold** it is compared against, and what the measurement does
 * **not** establish. That third field is the point of the module — a reader who
 * sees "40 identical messages from 3 accounts in 90 seconds" should also see,
 * in the same row, that this does not establish automation or a shared
 * operator.
 */
import { distinctAuthorCount } from "./authorGroups";
import {
  COORDINATION_THRESHOLDS,
  type ActivityBucket,
  type MessageCluster,
  type ObservationRef,
  type ParticipationRow,
  type PatternFinding,
} from "./schema";

const NOT_ESTABLISHED =
  "This is a measurement of the supplied observations. It does not establish automation, a shared operator, or intent, and no account is described as a bot.";

export function buildFindings(
  observations: ObservationRef[],
  clusters: MessageCluster[],
  buckets: ActivityBucket[],
  participation: ParticipationRow[],
): PatternFinding[] {
  const findings: PatternFinding[] = [];
  const analysedCount = observations.length;
  const authors = distinctAuthorCount(observations);

  // Below the minimum sample, the honest output is a statement that no claim
  // can be made — not a low-confidence claim.
  const underSampled = analysedCount < COORDINATION_THRESHOLDS.minObservationsForAnalysis;

  for (const cluster of clusters) {
    findings.push({
      findingId: `repeat:${cluster.clusterId}`,
      kind: "repeated_text",
      strength: underSampled ? "insufficient_evidence" : "measured",
      measurement: underSampled
        ? `${cluster.observationIds.length} observations share this text, but the whole sample is only ${analysedCount} observations.`
        : `${cluster.observationIds.length} observations from ${cluster.distinctAuthorCount} distinct author${cluster.distinctAuthorCount === 1 ? "" : "s"} share ${cluster.matchKind === "identical_text" ? "identical" : "near-identical"} text${cluster.spanSeconds !== null ? `, spanning ${cluster.spanSeconds} seconds` : ""}.`,
      threshold: `Repetition is reported at similarity >= ${COORDINATION_THRESHOLDS.repeatSimilarity} and cluster size >= ${COORDINATION_THRESHOLDS.minClusterSize}.`,
      supportingObservationIds: cluster.observationIds,
      limitation: underSampled
        ? `A sample under ${COORDINATION_THRESHOLDS.minObservationsForAnalysis} observations cannot support a pattern claim. ${NOT_ESTABLISHED}`
        : NOT_ESTABLISHED,
    });
  }

  for (const bucket of buckets.filter((entry) => entry.isBurst)) {
    findings.push({
      findingId: `burst:${bucket.startsAt}`,
      kind: "synchronized_burst",
      strength: underSampled ? "insufficient_evidence" : "measured",
      measurement: `${bucket.observationCount} observations from ${bucket.distinctAuthorCount} distinct author${bucket.distinctAuthorCount === 1 ? "" : "s"} fall in the ${COORDINATION_THRESHOLDS.burstBucketSeconds}-second window starting ${bucket.startsAt}, which is ${bucket.multipleOfMedian} times the median window.`,
      threshold: `A window is reported at >= ${COORDINATION_THRESHOLDS.burstMultiple}x the median window count, measured against the median rather than the mean so one large window cannot mask itself.`,
      supportingObservationIds: [],
      limitation: `A burst is also what a genuine news event looks like. ${NOT_ESTABLISHED}`,
    });
  }

  if (authors >= COORDINATION_THRESHOLDS.minAuthorsForConcentration) {
    const top = participation[0];

    if (top && top.share >= COORDINATION_THRESHOLDS.concentrationShare) {
      findings.push({
        findingId: `concentration:${top.authorKey}`,
        kind: "participation_concentration",
        strength: underSampled ? "insufficient_evidence" : "measured",
        measurement: `One author account produced ${top.observationCount} of ${analysedCount} analysable observations, a share of ${top.share}.`,
        threshold: `Concentration is reported at a top-author share >= ${COORDINATION_THRESHOLDS.concentrationShare}, and only when at least ${COORDINATION_THRESHOLDS.minAuthorsForConcentration} distinct authors are present.`,
        supportingObservationIds: [],
        limitation: `A prolific account is not necessarily an inauthentic one. ${NOT_ESTABLISHED}`,
      });
    }
  }

  return findings.sort((left, right) => left.findingId.localeCompare(right.findingId));
}

/**
 * The report-level statement when the sample cannot support any claim. Returned
 * instead of findings, not alongside a confident-looking summary.
 */
export function insufficientEvidenceFinding(analysedCount: number, authors: number): PatternFinding {
  const reasons: string[] = [];

  if (analysedCount < COORDINATION_THRESHOLDS.minObservationsForAnalysis) {
    reasons.push(`only ${analysedCount} analysable observations, below the published minimum of ${COORDINATION_THRESHOLDS.minObservationsForAnalysis}`);
  }

  if (authors < COORDINATION_THRESHOLDS.minAuthorsForConcentration) {
    reasons.push(`only ${authors} distinct author${authors === 1 ? "" : "s"}, below the published minimum of ${COORDINATION_THRESHOLDS.minAuthorsForConcentration}`);
  }

  return {
    findingId: "insufficient-evidence",
    kind: "repeated_text",
    strength: "insufficient_evidence",
    measurement: `The sample carries ${reasons.join(" and ")}.`,
    threshold: `Analysis requires at least ${COORDINATION_THRESHOLDS.minObservationsForAnalysis} analysable observations and at least ${COORDINATION_THRESHOLDS.minAuthorsForConcentration} distinct authors.`,
    supportingObservationIds: [],
    limitation:
      "No pattern claim is made at this sample size. Absence of a finding here is absence of evidence, not evidence of absence.",
  };
}
