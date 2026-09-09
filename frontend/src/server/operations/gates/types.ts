export type GateSeverity = "critical" | "warning";

export type GateStatus = "pass" | "fail" | "skip";

export type ReadinessVerdictStatus = "ready" | "blocked";

export interface GateContext {
  commit: string;
  environment: string;
  rootDir: string;
  skipRehearsals?: boolean;
}

export interface GateResult {
  id: string;
  name: string;
  severity: GateSeverity;
  status: GateStatus;
  detail: string;
  failureReason?: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface GateCheck {
  id: string;
  name: string;
  description: string;
  severity: GateSeverity;
  run: (context: GateContext) => Promise<GateResult>;
}

export interface VerdictSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  criticalFailures: number;
  warnings: number;
}

export interface VerdictReport {
  verdict: ReadinessVerdictStatus;
  commitSha: string;
  environment: string;
  evaluatedAt: string;
  summary: VerdictSummary;
  gates: GateResult[];
  reasons: string[];
}

export interface EvidenceArtifact {
  schemaVersion: string;
  commitSha: string;
  environment: string;
  generatedAt: string;
  verdict: VerdictReport;
  digest: string;
}
