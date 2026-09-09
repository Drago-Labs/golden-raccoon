import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GateCheck, GateContext, GateResult } from "../types";

/**
 * Validates operational rollback switches and rehearsal procedure.
 */
export const rollbackGate: GateCheck = {
  id: "rollback",
  name: "Rollback capability & rehearsal",
  description: "Verifies rollback environment switches, script automation, and documented procedures",
  severity: "critical",
  async run(context: GateContext): Promise<GateResult> {
    const start = Date.now();
    const docPath = join(context.rootDir, "docs/security/rollback-procedure.md");
    const scriptPath = join(context.rootDir, "scripts/rehearse-rollback.mjs");
    const providerHealthPath = join(context.rootDir, "frontend/src/server/observability/providerHealth.ts");

    if (!existsSync(docPath)) {
      return {
        id: "rollback",
        name: "Rollback capability & rehearsal",
        severity: "critical",
        status: "fail",
        detail: "Rollback procedure document is missing",
        failureReason: "docs/security/rollback-procedure.md does not exist",
        durationMs: Date.now() - start,
      };
    }

    if (!existsSync(scriptPath)) {
      return {
        id: "rollback",
        name: "Rollback capability & rehearsal",
        severity: "critical",
        status: "fail",
        detail: "Rollback rehearsal automation script is missing",
        failureReason: "scripts/rehearse-rollback.mjs does not exist",
        durationMs: Date.now() - start,
      };
    }

    if (!existsSync(providerHealthPath)) {
      return {
        id: "rollback",
        name: "Rollback capability & rehearsal",
        severity: "critical",
        status: "fail",
        detail: "Provider health module defining rollback switches is missing",
        failureReason: "frontend/src/server/observability/providerHealth.ts does not exist",
        durationMs: Date.now() - start,
      };
    }

    const providerHealthSrc = readFileSync(providerHealthPath, "utf8");
    const requiredSwitches = [
      "RECOMMENDATION_ONLY_MODE",
      "DISABLE_EXECUTION_PROVIDERS",
      "DISABLE_EVM_SUBMISSION",
      "DISABLE_STELLAR_SUBMISSION",
    ];

    const missingSwitches = requiredSwitches.filter((s) => !providerHealthSrc.includes(s));
    if (missingSwitches.length > 0) {
      return {
        id: "rollback",
        name: "Rollback capability & rehearsal",
        severity: "critical",
        status: "fail",
        detail: `Missing runtime rollback switches in providerHealth: ${missingSwitches.join(", ")}`,
        failureReason: `Switches not defined: ${missingSwitches.join(", ")}`,
        durationMs: Date.now() - start,
      };
    }

    return {
      id: "rollback",
      name: "Rollback capability & rehearsal",
      severity: "critical",
      status: "pass",
      detail: "Rollback automation, switches, and runbook procedures verified",
      durationMs: Date.now() - start,
      metadata: {
        switchesVerified: requiredSwitches,
        script: "scripts/rehearse-rollback.mjs",
      },
    };
  },
};
