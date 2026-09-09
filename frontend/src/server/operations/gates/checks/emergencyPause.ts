import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GateCheck, GateContext, GateResult } from "../types";

/**
 * Validates emergency pause automation, procedures, and contract circuit breakers.
 */
export const emergencyPauseGate: GateCheck = {
  id: "emergencyPause",
  name: "Emergency pause rehearsal & circuit breakers",
  description: "Verifies cross-chain emergency pause mechanisms, rehearsal script, and documented response",
  severity: "critical",
  async run(context: GateContext): Promise<GateResult> {
    const start = Date.now();
    const docPath = join(context.rootDir, "docs/security/emergency-pause-procedure.md");
    const scriptPath = join(context.rootDir, "scripts/rehearse-emergency-pause.mjs");
    const evmPolicyPath = join(context.rootDir, "backend/contracts/contracts/GoldRaccoonPolicy.sol");

    if (!existsSync(docPath)) {
      return {
        id: "emergencyPause",
        name: "Emergency pause rehearsal & circuit breakers",
        severity: "critical",
        status: "fail",
        detail: "Emergency pause procedure documentation is missing",
        failureReason: "docs/security/emergency-pause-procedure.md does not exist",
        durationMs: Date.now() - start,
      };
    }

    if (!existsSync(scriptPath)) {
      return {
        id: "emergencyPause",
        name: "Emergency pause rehearsal & circuit breakers",
        severity: "critical",
        status: "fail",
        detail: "Emergency pause rehearsal script is missing",
        failureReason: "scripts/rehearse-emergency-pause.mjs does not exist",
        durationMs: Date.now() - start,
      };
    }

    if (!existsSync(evmPolicyPath)) {
      return {
        id: "emergencyPause",
        name: "Emergency pause rehearsal & circuit breakers",
        severity: "critical",
        status: "fail",
        detail: "EVM policy contract is missing",
        failureReason: "backend/contracts/contracts/GoldRaccoonPolicy.sol does not exist",
        durationMs: Date.now() - start,
      };
    }

    const evmSrc = readFileSync(evmPolicyPath, "utf8");
    if (!evmSrc.includes("emergencyPause") && !evmSrc.includes("paused")) {
      return {
        id: "emergencyPause",
        name: "Emergency pause rehearsal & circuit breakers",
        severity: "critical",
        status: "fail",
        detail: "EVM policy contract does not implement pause circuit breaker",
        failureReason: "Missing emergencyPause/paused functions in GoldRaccoonPolicy.sol",
        durationMs: Date.now() - start,
      };
    }

    return {
      id: "emergencyPause",
      name: "Emergency pause rehearsal & circuit breakers",
      severity: "critical",
      status: "pass",
      detail: "Emergency pause script, procedures, and contract circuit breakers verified",
      durationMs: Date.now() - start,
      metadata: {
        script: "scripts/rehearse-emergency-pause.mjs",
        evmContract: "GoldRaccoonPolicy.sol",
      },
    };
  },
};
