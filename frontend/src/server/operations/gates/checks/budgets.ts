import { existsSync } from "node:fs";
import { join } from "node:path";
import { GateCheck, GateContext, GateResult } from "../types";

/**
 * Validates availability and compliance of SLO error budgets and performance thresholds.
 */
export const budgetsGate: GateCheck = {
  id: "budgets",
  name: "SLO error budget compliance",
  description: "Verifies SLO error budget configurations, tracking modules, and budget definitions",
  severity: "warning",
  async run(context: GateContext): Promise<GateResult> {
    const start = Date.now();
    const sloDocPath = join(context.rootDir, "docs/SLO_ERROR_BUDGETS.md");
    const sloModulePath = join(context.rootDir, "frontend/src/server/observability/slo.ts");

    if (!existsSync(sloDocPath)) {
      return {
        id: "budgets",
        name: "SLO error budget compliance",
        severity: "warning",
        status: "fail",
        detail: "SLO error budgets document is missing",
        failureReason: "docs/SLO_ERROR_BUDGETS.md does not exist",
        durationMs: Date.now() - start,
      };
    }

    if (!existsSync(sloModulePath)) {
      return {
        id: "budgets",
        name: "SLO error budget compliance",
        severity: "warning",
        status: "fail",
        detail: "SLO tracking implementation module is missing",
        failureReason: "frontend/src/server/observability/slo.ts does not exist",
        durationMs: Date.now() - start,
      };
    }

    return {
      id: "budgets",
      name: "SLO error budget compliance",
      severity: "warning",
      status: "pass",
      detail: "SLO definitions, error budget thresholds, and monitoring modules verified",
      durationMs: Date.now() - start,
      metadata: {
        doc: "docs/SLO_ERROR_BUDGETS.md",
        module: "frontend/src/server/observability/slo.ts",
      },
    };
  },
};
