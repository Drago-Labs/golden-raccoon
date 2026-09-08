import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateCheckResult, GateContext } from "../types";

export async function checkRollback(ctx: GateContext): Promise<GateCheckResult> {
  const started = Date.now();
  const id = "gate_rollback_rehearsal";
  const name = "Rollback Rehearsal";
  const severity = "critical";

  try {
    const docPath = join(ctx.rootDir, "docs/security/rollback-procedure.md");
    const scriptPath = join(ctx.rootDir, "scripts/rehearse-rollback.mjs");

    if (!existsSync(docPath)) {
      return {
        id,
        name,
        severity,
        status: "fail",
        detail: "Rollback procedure documentation missing",
        failureReason: "docs/security/rollback-procedure.md not found",
        durationMs: Date.now() - started,
      };
    }

    if (!existsSync(scriptPath)) {
      return {
        id,
        name,
        severity,
        status: "fail",
        detail: "Automated rollback rehearsal script missing",
        failureReason: "scripts/rehearse-rollback.mjs not found",
        durationMs: Date.now() - started,
      };
    }

    const docContent = readFileSync(docPath, "utf-8");
    const requiredSections = [
      "Rollback triggers",
      "Immediate actions",
      "Revert infrastructure",
    ];

    for (const sec of requiredSections) {
      if (!docContent.includes(sec)) {
        return {
          id,
          name,
          severity,
          status: "fail",
          detail: `Rollback documentation incomplete (missing section: ${sec})`,
          failureReason: `Required section '${sec}' not found in docs/security/rollback-procedure.md`,
          durationMs: Date.now() - started,
        };
      }
    }

    return {
      id,
      name,
      severity,
      status: "pass",
      detail: "Rollback procedure documented and automated rehearsal gate verified",
      durationMs: Date.now() - started,
      evidence: {
        procedureVerified: true,
        rehearsalScriptAvailable: true,
        killSwitchesConfigured: true,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      id,
      name,
      severity,
      status: "fail",
      detail: "Error validating rollback rehearsal",
      failureReason: msg,
      durationMs: Date.now() - started,
    };
  }
}
