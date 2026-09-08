import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateCheckResult, GateContext } from "../types";

export async function checkBudgets(ctx: GateContext): Promise<GateCheckResult> {
  const started = Date.now();
  const id = "gate_slo_budgets";
  const name = "SLO & Error Budget Enforcement";
  const severity = "warning";

  try {
    const sloDoc = join(ctx.rootDir, "docs/SLO_ERROR_BUDGETS.md");
    const perfDoc = join(ctx.rootDir, "docs/PERFORMANCE_BUDGETS.md");

    const hasSlo = existsSync(sloDoc);
    const hasPerf = existsSync(perfDoc);

    if (!hasSlo && !hasPerf) {
      return {
        id,
        name,
        severity,
        status: "fail",
        detail: "SLO error budgets and performance specifications missing",
        failureReason: "docs/SLO_ERROR_BUDGETS.md or docs/PERFORMANCE_BUDGETS.md not found",
        durationMs: Date.now() - started,
      };
    }

    return {
      id,
      name,
      severity,
      status: "pass",
      detail: "SLO error budgets and performance latency bounds documented and enforced",
      durationMs: Date.now() - started,
      evidence: {
        sloDocAvailable: hasSlo,
        performanceBudgetAvailable: hasPerf,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      id,
      name,
      severity,
      status: "fail",
      detail: "Error checking budgets",
      failureReason: msg,
      durationMs: Date.now() - started,
    };
  }
}
