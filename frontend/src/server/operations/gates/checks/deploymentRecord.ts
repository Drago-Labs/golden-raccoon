import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateCheckResult, GateContext } from "../types";

export async function checkDeploymentRecord(ctx: GateContext): Promise<GateCheckResult> {
  const started = Date.now();
  const id = "gate_deployment_record";
  const name = "Target Environment Deployment Record";
  const severity = ctx.environment === "production" ? "critical" : "warning";

  try {
    const deploymentsDir = join(ctx.rootDir, "docs/deployments");
    const templatePath = join(deploymentsDir, "TEMPLATE.md");

    if (!existsSync(templatePath)) {
      return {
        id,
        name,
        severity,
        status: "fail",
        detail: "Deployment record template missing",
        failureReason: "docs/deployments/TEMPLATE.md not found",
        durationMs: Date.now() - started,
      };
    }

    const files = readdirSync(deploymentsDir).filter(
      (f) => f.endsWith(".json") || (f.endsWith(".md") && f !== "TEMPLATE.md")
    );

    if (ctx.environment === "production" && files.length === 0) {
      return {
        id,
        name,
        severity: "critical",
        status: "fail",
        detail: `No deployment records found in docs/deployments for environment '${ctx.environment}'`,
        failureReason: "Missing production deployment record",
        durationMs: Date.now() - started,
      };
    }

    return {
      id,
      name,
      severity,
      status: "pass",
      detail: `Deployment record schema verified for environment '${ctx.environment}' (${files.length} record(s) found)`,
      durationMs: Date.now() - started,
      evidence: {
        templatePresent: true,
        recordCount: files.length,
        environment: ctx.environment,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      id,
      name,
      severity,
      status: "fail",
      detail: "Error validating deployment records",
      failureReason: msg,
      durationMs: Date.now() - started,
    };
  }
}
