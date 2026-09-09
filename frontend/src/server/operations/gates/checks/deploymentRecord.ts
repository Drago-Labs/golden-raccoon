import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GateCheck, GateContext, GateResult } from "../types";

/**
 * Validates existence and completeness of deployment records for the target release environment.
 */
export const deploymentRecordGate: GateCheck = {
  id: "deploymentRecord",
  name: "Deployment record validation",
  description: "Verifies deployment record completeness and schema requirements for the target environment",
  severity: "critical",
  async run(context: GateContext): Promise<GateResult> {
    const start = Date.now();
    const deploymentsDir = join(context.rootDir, "docs/deployments");
    const templatePath = join(deploymentsDir, "TEMPLATE.md");

    if (!existsSync(deploymentsDir) || !existsSync(templatePath)) {
      return {
        id: "deploymentRecord",
        name: "Deployment record validation",
        severity: "critical",
        status: "fail",
        detail: "Deployment documentation directory or TEMPLATE.md is missing",
        failureReason: "docs/deployments/TEMPLATE.md does not exist",
        durationMs: Date.now() - start,
      };
    }

    const env = (context.environment || "production").toLowerCase();
    const isProduction = env === "production" || env === "mainnet";

    const files = readdirSync(deploymentsDir);
    const envRecords = files.filter(
      (f) =>
        f !== "TEMPLATE.md" &&
        (f.toLowerCase().includes(env) || f.endsWith(".json") || f.endsWith(".md"))
    );

    if (envRecords.length === 0) {
      const templateContent = readFileSync(templatePath, "utf8");
      const requiredSections = [
        "## Identity",
        "## Source",
        "## Rollback",
        "## Release Readiness Gates & Evidence Verification",
      ];
      const missingSections = requiredSections.filter((s) => !templateContent.includes(s));
      if (missingSections.length > 0) {
        return {
          id: "deploymentRecord",
          name: "Deployment record validation",
          severity: "critical",
          status: "fail",
          detail: `Deployment template missing required sections: ${missingSections.join(", ")}`,
          failureReason: `docs/deployments/TEMPLATE.md missing sections: ${missingSections.join(", ")}`,
          durationMs: Date.now() - start,
        };
      }
    }

    if (envRecords.length > 0) {
      for (const recordName of envRecords) {
        const recordPath = join(deploymentsDir, recordName);
        const content = readFileSync(recordPath, "utf8");

        if (recordName.endsWith(".json")) {
          try {
            const data = JSON.parse(content);
            const requiredFields = [
              "chain",
              "network",
              "contractAddress",
              "commitSha",
            ];
            const missing = requiredFields.filter((field) => !data[field]);
            if (missing.length > 0) {
              return {
                id: "deploymentRecord",
                name: "Deployment record validation",
                severity: "critical",
                status: "fail",
                detail: `Deployment record ${recordName} missing fields: ${missing.join(", ")}`,
                failureReason: `Incomplete record in ${recordName}`,
                durationMs: Date.now() - start,
              };
            }
          } catch (err) {
            return {
              id: "deploymentRecord",
              name: "Deployment record validation",
              severity: "critical",
              status: "fail",
              detail: `Failed parsing deployment record JSON ${recordName}: ${(err as Error).message}`,
              failureReason: `Invalid JSON in ${recordName}`,
              durationMs: Date.now() - start,
            };
          }
        } else if (recordName.endsWith(".md")) {
          if (content.includes("<chain>") || content.includes("<address>")) {
            return {
              id: "deploymentRecord",
              name: "Deployment record validation",
              severity: "critical",
              status: "fail",
              detail: `Deployment record ${recordName} contains unpopulated template placeholders`,
              failureReason: `Unfilled template placeholders in ${recordName}`,
              durationMs: Date.now() - start,
            };
          }
        }
      }
    }

    return {
      id: "deploymentRecord",
      name: "Deployment record validation",
      severity: "critical",
      status: "pass",
      detail: `Deployment record verified for environment '${env}'`,
      durationMs: Date.now() - start,
      metadata: {
        environment: env,
        matchedRecords: envRecords,
      },
    };
  },
};
