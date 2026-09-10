import type { GateContext, GateCheckResult, GateVerdict, GateVerdictSummary } from "./types";
import { registeredGates } from "./registry";

export async function evaluateReadinessVerdict(ctx: GateContext): Promise<GateVerdict> {
  const results: GateCheckResult[] = [];

  for (const gate of registeredGates) {
    try {
      const res = await gate.run(ctx);
      results.push(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        id: gate.id,
        name: gate.name,
        severity: gate.severity,
        status: "fail",
        detail: `Gate execution encountered an unexpected error: ${msg}`,
        failureReason: msg,
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

  const summary: GateVerdictSummary = {
    total: results.length,
    passed,
    failed,
    skipped,
    criticalFailures,
    warnings,
  };

  const verdict = criticalFailures === 0 ? "ready" : "blocked";

  return {
    verdict,
    commitSha: ctx.commitSha,
    environment: ctx.environment,
    timestamp: new Date().toISOString(),
    summary,
    gates: results,
    reasons,
  };
}
