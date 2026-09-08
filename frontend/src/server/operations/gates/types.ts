export type GateSeverity = "critical" | "warning";

export type GateStatus = "pass" | "fail" | "skip";

export interface GateCheckResult {
  id: string;
  name: string;
  severity: GateSeverity;
  status: GateStatus;
  detail: string;
  durationMs: number;
  evidence?: Record<string, unknown>;
  failureReason?: string;
}

export interface GateContext {
  commitSha: string;
  environment: string;
  rootDir: string;
  strict?: boolean;
}

export interface GateDefinition {
  id: string;
  name: string;
  severity: GateSeverity;
  description: string;
  run: (ctx: GateContext) => Promise<GateCheckResult> | GateCheckResult;
}

export interface GateVerdictSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  criticalFailures: number;
  warnings: number;
}

export interface GateVerdict {
  verdict: "ready" | "blocked";
  commitSha: string;
  environment: string;
  timestamp: string;
  summary: GateVerdictSummary;
  gates: GateCheckResult[];
  reasons: string[];
}

export interface EvidenceArtifact {
  schemaVersion: string;
  commitSha: string;
  environment: string;
  generatedAt: string;
  verdict: GateVerdict;
  digest: string;
}
