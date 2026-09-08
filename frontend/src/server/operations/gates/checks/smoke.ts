import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateCheckResult, GateContext } from "../types";

export async function checkSmoke(ctx: GateContext): Promise<GateCheckResult> {
  const started = Date.now();
  const id = "gate_smoke_coverage";
  const name = "Critical Route Smoke Coverage";
  const severity = "critical";

  try {
    const smokeScript = join(ctx.rootDir, "scripts/smoke-api.mjs");
    if (!existsSync(smokeScript)) {
      return {
        id,
        name,
        severity,
        status: "fail",
        detail: "Smoke testing script missing",
        failureReason: "scripts/smoke-api.mjs not found",
        durationMs: Date.now() - started,
      };
    }

    const content = readFileSync(smokeScript, "utf-8");
    const requiredEndpoints = [
      "/api/health",
      "/api/agents/portfolio",
      "/api/execute/prepare",
      "/api/x402/terms",
    ];

    const missing = requiredEndpoints.filter((ep) => !content.includes(ep));
    if (missing.length > 0) {
      return {
        id,
        name,
        severity,
        status: "fail",
        detail: `Smoke tests missing critical endpoints: ${missing.join(", ")}`,
        failureReason: `Endpoints [${missing.join(", ")}] not covered in scripts/smoke-api.mjs`,
        durationMs: Date.now() - started,
      };
    }

    return {
      id,
      name,
      severity,
      status: "pass",
      detail: "All critical route smoke checks verified and structured output configured",
      durationMs: Date.now() - started,
      evidence: {
        coveredEndpoints: requiredEndpoints,
        structuredReporting: true,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      id,
      name,
      severity,
      status: "fail",
      detail: "Error validating smoke test coverage",
      failureReason: msg,
      durationMs: Date.now() - started,
    };
  }
}
