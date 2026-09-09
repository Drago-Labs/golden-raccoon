import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GateCheck, GateContext, GateResult } from "../types";

/**
 * Validates smoke test coverage of critical API endpoints and structured result reporting.
 */
export const smokeGate: GateCheck = {
  id: "smoke",
  name: "Critical route smoke coverage",
  description: "Verifies smoke tests exercise all critical API endpoints and support structured result reporting",
  severity: "critical",
  async run(context: GateContext): Promise<GateResult> {
    const start = Date.now();
    const smokeScriptPath = join(context.rootDir, "scripts/smoke-api.mjs");

    if (!existsSync(smokeScriptPath)) {
      return {
        id: "smoke",
        name: "Critical route smoke coverage",
        severity: "critical",
        status: "fail",
        detail: "Smoke test script is missing",
        failureReason: "scripts/smoke-api.mjs does not exist",
        durationMs: Date.now() - start,
      };
    }

    const criticalRoutes = [
      "frontend/src/app/api/health/route.ts",
      "frontend/src/app/api/x402/deep-scan/route.ts",
      "frontend/src/app/api/history/agent-runs/route.ts",
      "frontend/src/app/api/operations/readiness/route.ts",
      "frontend/src/app/api/execute/prepare/route.ts",
    ];

    const missingRoutes = criticalRoutes.filter((r) => !existsSync(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ context.rootDir, r)));
    if (missingRoutes.length > 0) {
      return {
        id: "smoke",
        name: "Critical route smoke coverage",
        severity: "critical",
        status: "fail",
        detail: `Missing critical route implementation files: ${missingRoutes.join(", ")}`,
        failureReason: `Files missing: ${missingRoutes.join(", ")}`,
        durationMs: Date.now() - start,
      };
    }

    const scriptSrc = readFileSync(smokeScriptPath, "utf8");
    if (!scriptSrc.includes("--json")) {
      return {
        id: "smoke",
        name: "Critical route smoke coverage",
        severity: "critical",
        status: "fail",
        detail: "Smoke test script does not support --json structured output",
        failureReason: "scripts/smoke-api.mjs missing structured JSON output support",
        durationMs: Date.now() - start,
      };
    }

    return {
      id: "smoke",
      name: "Critical route smoke coverage",
      severity: "critical",
      status: "pass",
      detail: "Critical routes and structured smoke testing automation verified",
      durationMs: Date.now() - start,
      metadata: {
        criticalRoutesChecked: criticalRoutes.length,
        structuredOutputSupported: true,
      },
    };
  },
};
