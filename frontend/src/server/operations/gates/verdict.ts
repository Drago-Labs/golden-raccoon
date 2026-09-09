import { GateContext, GateResult, ReadinessVerdictStatus, VerdictReport } from "./types";
import { getAllGates } from "./registry";

/**
 * Executes all registered gates against the provided context and produces an aggregate verdict report.
 */
export async function evaluateReadinessGates(context: GateContext): Promise<VerdictReport> {
  const gates = getAllGates();
  const results: GateResult[] = [];

  for (const gate of gates) {
    try {
      const result = await gate.run(context);
      results.push(result);
    } catch (err) {
      results.push({
        id: gate.id,
        name: gate.name,
        severity: gate.severity,
        status: "fail",
        detail: `Unhandled error executing gate: ${(err as Error).message}`,
        failureReason: (err as Error).message,
        durationMs: 0,
      });
    }
  }

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let criticalFailures = 0;
  let warnings = 0;
  const reasons: string[] = [];

  for (const r of results) {
    if (r.status === "pass") {
      passed += 1;
    } else if (r.status === "skip") {
      skipped += 1;
    } else {
      failed += 1;
      if (r.severity === "critical") {
        criticalFailures += 1;
        reasons.push(`[CRITICAL] ${r.name}: ${r.failureReason || r.detail}`);
      } else {
        warnings += 1;
        reasons.push(`[WARNING] ${r.name}: ${r.failureReason || r.detail}`);
      }
    }
  }

  const verdict: ReadinessVerdictStatus = criticalFailures === 0 ? "ready" : "blocked";

  return {
    verdict,
    commitSha: context.commit,
    environment: context.environment,
    evaluatedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      passed,
      failed,
      skipped,
      criticalFailures,
      warnings,
    },
    gates: results,
    reasons,
  };
}
