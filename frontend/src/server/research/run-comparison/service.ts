/**
 * Public entry point for side-by-side saved run investigation.
 *
 * `compareRuns` loads two stored runs through a read-only port, checks that
 * both belong to the caller *before* any content reaches the report, and
 * returns a comparison. It runs no agent, calls no provider, records no replay
 * and writes nothing.
 */
import { alignAgents } from "./alignment";
import { assessComparability } from "./comparability";
import { diffFindings } from "./findingDiff";
import { diffInputs } from "./inputDiff";
import { assertSameContext, loadOwnedRun } from "./ownership";
import { coOccurringDrop, diffQuality } from "./qualityDiff";
import {
  RUN_COMPARISON_SCHEMA_VERSION,
  RunComparisonError,
  runComparisonRequestSchema,
  type AgentDifference,
  type ComparisonCoverage,
  type FieldChange,
  type RunComparisonReport,
  type RunReader,
} from "./schema";

function fieldChange(field: string, before: string | null, after: string | null): FieldChange {
  return { field, before, after, changed: before !== after };
}

function buildCoverage(differences: AgentDifference[], incomparable: boolean): ComparisonCoverage {
  const inOneOnly = differences.filter((entry) => entry.alignment !== "present_in_both").length;
  const ambiguous = differences.reduce(
    (total, entry) => total + entry.findings.filter((pair) => pair.alignment === "ambiguous").length,
    0,
  );

  const shared = { agentsCompared: differences.length, agentsInOneRunOnly: inOneOnly, ambiguousFindingCount: ambiguous };

  if (differences.length === 0) {
    return {
      ...shared,
      state: "empty",
      note: "Neither run stored an agent result, so there is nothing to align. This is a successful result, not a failure.",
    };
  }

  if (incomparable) {
    return {
      ...shared,
      state: "unavailable",
      note: "These runs are not like-for-like, so the differences below describe two different questions rather than a change.",
    };
  }

  if (inOneOnly > 0 || ambiguous > 0) {
    return {
      ...shared,
      state: "partial",
      note: `${inOneOnly} agent(s) appear in only one run and ${ambiguous} finding pairing(s) are undetermined. Those are shown as such rather than resolved by guessing.`,
    };
  }

  return {
    ...shared,
    state: "complete",
    note: "Every agent and every finding aligned across both runs.",
  };
}

export async function compareRuns(input: unknown, reader: RunReader): Promise<RunComparisonReport> {
  const parsed = runComparisonRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new RunComparisonError("invalid_request", "The comparison request could not be read.", 400, parsed.error.flatten());
  }

  const { walletAddress, leftRunId, rightRunId, network } = parsed.data;

  if (leftRunId === rightRunId) {
    throw new RunComparisonError("same_run", "A run cannot be compared against itself.", 400);
  }

  // Ownership first: no field of either record is read into the report until
  // both are confirmed to belong to the caller.
  const left = await loadOwnedRun(reader, { runId: leftRunId, walletAddress });
  const right = await loadOwnedRun(reader, { runId: rightRunId, walletAddress });

  assertSameContext(left, right, network);

  const { comparability, note } = assessComparability(left, right);
  const { pairs } = alignAgents(left.results, right.results);
  const qualityChanges = diffQuality(pairs);

  const agentDifferences: AgentDifference[] = pairs.map((pair) => {
    const before = pair.left ? Number(pair.left.riskScore ?? pair.left.score ?? 0) : null;
    const after = pair.right ? Number(pair.right.riskScore ?? pair.right.score ?? 0) : null;
    const delta = before !== null && after !== null ? after - before : null;
    const quality = qualityChanges.find((entry) => entry.agent === pair.agent);

    return {
      agent: pair.agent,
      alignment: pair.alignment,
      scoreChange: { before, after, delta },
      recommendationChange: fieldChange(
        "recommendedAction",
        pair.left ? String(pair.left.recommendedAction ?? "") : null,
        pair.right ? String(pair.right.recommendedAction ?? "") : null,
      ),
      verdictChange: fieldChange(
        "verdict",
        pair.left ? String(pair.left.verdict ?? "") : null,
        pair.right ? String(pair.right.verdict ?? "") : null,
      ),
      findings: diffFindings(pair.agent, pair.left?.findings ?? [], pair.right?.findings ?? []),
      missingDataChange: {
        before: (pair.left?.missingData ?? []).map((entry) => String(entry.field)),
        after: (pair.right?.missingData ?? []).map((entry) => String(entry.field)),
      },
      coOccurringCoverageDrop: quality ? coOccurringDrop(quality, delta) : false,
    };
  });

  return {
    schemaVersion: RUN_COMPARISON_SCHEMA_VERSION,
    left: left.header,
    right: right.header,
    comparability,
    comparabilityNote: note,
    inputDifferences: diffInputs(left.inputSnapshot, right.inputSnapshot),
    agentDifferences,
    qualityChanges,
    recommendationChange: fieldChange("recommendation", left.header.recommendation, right.header.recommendation),
    decisionScoreChange: {
      before: left.header.decisionScore,
      after: right.header.decisionScore,
      delta: right.header.decisionScore - left.header.decisionScore,
    },
    coverage: buildCoverage(agentDifferences, comparability !== "comparable"),
    causeNotEstablished: true,
    readOnly: true,
  };
}

export { RunComparisonError } from "./schema";
export type { RunComparisonReport, RunReader } from "./schema";
