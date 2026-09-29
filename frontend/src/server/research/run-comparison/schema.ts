/**
 * Versioned contract for side-by-side saved agent run investigation.
 *
 * The line this feature refuses to cross: **it reports what changed, never
 * why.** Two runs of the same agent can differ because the world changed,
 * because a provider was down, or because the scoring changed underneath —
 * and a saved record usually cannot tell those apart. So the report separates
 * *changed observations* from *changed recommendations*, attaches each one's
 * source timestamps, and declines to name a cause.
 *
 * Nothing here re-runs an agent, contacts a provider or writes a record. It
 * reads two stored runs and compares them.
 */
import { z } from "zod";

export const RUN_COMPARISON_SCHEMA_VERSION = "run-comparison/2026-01" as const;

export const COMPARISON_LIMITS = {
  /** Runs loadable in one comparison. Exactly two, by design. */
  runsPerComparison: 2,
  /** Findings aligned per agent before the report truncates. */
  maxFindingsPerAgent: 200,
  maxRequestBytes: 32_768,
} as const;

/** How confidently two records can be compared at all. */
export type Comparability = "comparable" | "different_subject" | "different_mode" | "incomparable";

export type RunHeader = {
  runId: string;
  walletAddress: string;
  network: string | null;
  mode: string | null;
  status: string;
  recommendation: string;
  decisionScore: number;
  confidence: number;
  createdAt: string;
  /** The asset the run was about, when the record names one. */
  subjectKey: string | null;
};

export type FieldChange = {
  field: string;
  before: string | null;
  after: string | null;
  changed: boolean;
};

/**
 * Alignment of one agent across two runs.
 *
 * `present_in_one` is a first-class outcome: an agent that ran once and not
 * the other is a fact about the runs, and turning it into "score went to zero"
 * would be a fabrication.
 */
export type AgentAlignment =
  | "present_in_both"
  | "only_in_left"
  | "only_in_right";

export type FindingAlignment = "matched" | "added" | "removed" | "ambiguous";

/**
 * A finding pairing.
 *
 * `ambiguous` means two findings in one run share an identity with one in the
 * other, so the pairing is not determined. The report says so rather than
 * picking one — a wrong pairing shows a score "change" that never happened.
 */
export type FindingPair = {
  pairId: string;
  alignment: FindingAlignment;
  label: string;
  left: { severity: string; detail: string; scoreImpact: number | null } | null;
  right: { severity: string; detail: string; scoreImpact: number | null } | null;
  /** Set when the pairing could not be determined. */
  ambiguityNote: string | null;
};

/**
 * How data quality changed for one agent.
 *
 * A provider outage and a real score change are different facts, and this type
 * keeps them apart so the UI cannot merge them.
 */
export type QualityChange = {
  agent: string;
  left: { mode: string; connectedSources: number; unavailableSources: number; reliability: number; lastCheckedAt: string | null } | null;
  right: { mode: string; connectedSources: number; unavailableSources: number; reliability: number; lastCheckedAt: string | null } | null;
  /** True when sources became unavailable between the runs. */
  coverageDropped: boolean;
  /** What this establishes, and what it does not. */
  note: string;
};

export type AgentDifference = {
  agent: string;
  alignment: AgentAlignment;
  scoreChange: { before: number | null; after: number | null; delta: number | null };
  recommendationChange: FieldChange;
  verdictChange: FieldChange;
  findings: FindingPair[];
  missingDataChange: { before: string[]; after: string[] };
  /**
   * Whether the change in this agent's score is accompanied by a drop in
   * coverage. Never presented as a cause — only as a co-occurrence.
   */
  coOccurringCoverageDrop: boolean;
};

export type InputDifference = {
  path: string;
  before: string | null;
  after: string | null;
  kind: "added" | "removed" | "changed";
};

export type ComparisonCoverage = {
  state: "complete" | "partial" | "unavailable" | "empty";
  note: string;
  agentsCompared: number;
  agentsInOneRunOnly: number;
  ambiguousFindingCount: number;
};

export type RunComparisonReport = {
  schemaVersion: typeof RUN_COMPARISON_SCHEMA_VERSION;
  left: RunHeader;
  right: RunHeader;
  comparability: Comparability;
  /** Why the pair is or is not comparable, in plain language. */
  comparabilityNote: string;
  inputDifferences: InputDifference[];
  agentDifferences: AgentDifference[];
  qualityChanges: QualityChange[];
  recommendationChange: FieldChange;
  decisionScoreChange: { before: number; after: number; delta: number };
  coverage: ComparisonCoverage;
  /**
   * Carried as data so a UI cannot present a correlation as a cause.
   */
  causeNotEstablished: true;
  /** This feature runs no agent, calls no provider and writes no record. */
  readOnly: true;
};

export const runComparisonRequestSchema = z.object({
  walletAddress: z.string().trim().min(1).max(120),
  network: z.string().trim().min(1).max(40).optional(),
  leftRunId: z.string().trim().min(1).max(120),
  rightRunId: z.string().trim().min(1).max(120),
});

export type RunComparisonRequest = z.infer<typeof runComparisonRequestSchema>;

export class RunComparisonError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "RunComparisonError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * The read port for saved runs.
 *
 * One method, and it is a read. There is no create, no update and no replay,
 * so this feature cannot start an agent or change a stored record.
 */
export type RunReader = {
  getRun(input: { runId: string; walletAddress: string }): Promise<unknown> | unknown;
};
