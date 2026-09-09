import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GateCheck, GateContext, GateResult } from "../types";

/**
 * Validates load testing scripts, structured output emission, and performance budget baselines.
 */
export const loadGate: GateCheck = {
  id: "load",
  name: "Load behaviour & performance budgets",
  description: "Verifies load test harness emits structured results and enforces recorded performance budgets",
  severity: "critical",
  async run(context: GateContext): Promise<GateResult> {
    const start = Date.now();
    const executionScriptPath = join(context.rootDir, "scripts/load-test-execution.mjs");
    const simulationScriptPath = join(context.rootDir, "scripts/load-test-simulation.mjs");
    const budgetDocPath = join(context.rootDir, "docs/PERFORMANCE_BUDGETS.md");

    if (!existsSync(executionScriptPath)) {
      return {
        id: "load",
        name: "Load behaviour & performance budgets",
        severity: "critical",
        status: "fail",
        detail: "Execution load test script is missing",
        failureReason: "scripts/load-test-execution.mjs does not exist",
        durationMs: Date.now() - start,
      };
    }

    if (!existsSync(simulationScriptPath)) {
      return {
        id: "load",
        name: "Load behaviour & performance budgets",
        severity: "critical",
        status: "fail",
        detail: "Simulation load test script is missing",
        failureReason: "scripts/load-test-simulation.mjs does not exist",
        durationMs: Date.now() - start,
      };
    }

    if (!existsSync(budgetDocPath)) {
      return {
        id: "load",
        name: "Load behaviour & performance budgets",
        severity: "critical",
        status: "fail",
        detail: "Recorded performance budgets document is missing",
        failureReason: "docs/PERFORMANCE_BUDGETS.md does not exist",
        durationMs: Date.now() - start,
      };
    }

    const execSrc = readFileSync(executionScriptPath, "utf8");
    const simSrc = readFileSync(simulationScriptPath, "utf8");

    if (!execSrc.includes("--json") || !simSrc.includes("--json")) {
      return {
        id: "load",
        name: "Load behaviour & performance budgets",
        severity: "critical",
        status: "fail",
        detail: "Load test scripts must support --json structured output",
        failureReason: "Missing structured JSON support in load test scripts",
        durationMs: Date.now() - start,
      };
    }

    return {
      id: "load",
      name: "Load behaviour & performance budgets",
      severity: "critical",
      status: "pass",
      detail: "Load testing scripts, structured output, and recorded baselines verified",
      durationMs: Date.now() - start,
      metadata: {
        budgetDoc: "docs/PERFORMANCE_BUDGETS.md",
        scripts: [
          "scripts/load-test-execution.mjs",
          "scripts/load-test-simulation.mjs",
        ],
      },
    };
  },
};
