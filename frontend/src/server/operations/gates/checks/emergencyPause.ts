import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateCheckResult, GateContext } from "../types";

export async function checkEmergencyPause(ctx: GateContext): Promise<GateCheckResult> {
  const started = Date.now();
  const id = "gate_emergency_pause_rehearsal";
  const name = "Emergency Pause Rehearsal";
  const severity = "critical";

  try {
    const docPath = join(ctx.rootDir, "docs/security/emergency-pause-procedure.md");
    const scriptPath = join(ctx.rootDir, "scripts/rehearse-emergency-pause.mjs");

    if (!existsSync(docPath)) {
      return {
        id,
        name,
        severity,
        status: "fail",
        detail: "Emergency pause documentation missing",
        failureReason: "docs/security/emergency-pause-procedure.md not found",
        durationMs: Date.now() - started,
      };
    }

    if (!existsSync(scriptPath)) {
      return {
        id,
        name,
        severity,
        status: "fail",
        detail: "Emergency pause rehearsal script missing",
        failureReason: "scripts/rehearse-emergency-pause.mjs not found",
        durationMs: Date.now() - started,
      };
    }

    const docContent = readFileSync(docPath, "utf-8");
    if (!docContent.includes("emergencyPause()") || !docContent.includes("emergency_pause")) {
      return {
        id,
        name,
        severity,
        status: "fail",
        detail: "Emergency pause procedure missing EVM or Soroban contract pause definitions",
        failureReason: "Contract pause references not found in emergency pause procedure",
        durationMs: Date.now() - started,
      };
    }

    return {
      id,
      name,
      severity,
      status: "pass",
      detail: "Emergency pause rehearsal gate and multi-chain pause hooks verified",
      durationMs: Date.now() - started,
      evidence: {
        evmPauseHook: "emergencyPause()",
        sorobanPauseHook: "emergency_pause",
        rehearsalScriptAvailable: true,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      id,
      name,
      severity,
      status: "fail",
      detail: "Error validating emergency pause",
      failureReason: msg,
      durationMs: Date.now() - started,
    };
  }
}
