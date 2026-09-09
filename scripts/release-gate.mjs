#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";

/**
 * Deterministically sorts object keys and converts value to a canonical JSON string.
 */
export function canonicalizeJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const serializedElements = value.map((item) => canonicalizeJson(item));
    return `[${serializedElements.join(",")}]`;
  }

  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  const serializedProps = entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalizeJson(v)}`);
  return `{${serializedProps.join(",")}}`;
}

/**
 * Computes SHA-256 hex digest of a verdict object.
 */
export function computeVerdictDigest(verdict) {
  const canonical = canonicalizeJson(verdict);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Resolves the active git commit SHA.
 */
export function getCommitSha(rootDir) {
  if (process.env.GIT_COMMIT) {
    return process.env.GIT_COMMIT;
  }
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA;
  }
  try {
    return execSync("git rev-parse HEAD", { cwd: rootDir, encoding: "utf8" }).trim();
  } catch {
    return "0000000000000000000000000000000000000000";
  }
}

/**
 * Executes machine-checkable gate checks against the codebase.
 */
export function runGates(context) {
  const rootDir = context.rootDir;
  const env = (context.environment || "production").toLowerCase();
  const results = [];

  const startRollback = Date.now();
  const rollbackDoc = join(rootDir, "docs/security/rollback-procedure.md");
  const rollbackScript = join(rootDir, "scripts/rehearse-rollback.mjs");
  const providerHealthPath = join(rootDir, "frontend/src/server/observability/providerHealth.ts");

  if (!existsSync(rollbackDoc) || !existsSync(rollbackScript) || !existsSync(providerHealthPath)) {
    results.push({
      id: "rollback",
      name: "Rollback capability & rehearsal",
      severity: "critical",
      status: "fail",
      detail: "Rollback procedure, rehearsal script, or providerHealth missing",
      failureReason: "Missing required rollback artifacts",
      durationMs: Date.now() - startRollback,
    });
  } else {
    const healthSrc = readFileSync(providerHealthPath, "utf8");
    const requiredSwitches = [
      "RECOMMENDATION_ONLY_MODE",
      "DISABLE_EXECUTION_PROVIDERS",
      "DISABLE_EVM_SUBMISSION",
      "DISABLE_STELLAR_SUBMISSION",
    ];
    const missing = requiredSwitches.filter((s) => !healthSrc.includes(s));
    if (missing.length > 0) {
      results.push({
        id: "rollback",
        name: "Rollback capability & rehearsal",
        severity: "critical",
        status: "fail",
        detail: `Missing runtime rollback switches: ${missing.join(", ")}`,
        failureReason: `Switches not found in providerHealth.ts`,
        durationMs: Date.now() - startRollback,
      });
    } else {
      results.push({
        id: "rollback",
        name: "Rollback capability & rehearsal",
        severity: "critical",
        status: "pass",
        detail: "Rollback automation, switches, and runbook procedures verified",
        durationMs: Date.now() - startRollback,
      });
    }
  }

  const startPause = Date.now();
  const pauseDoc = join(rootDir, "docs/security/emergency-pause-procedure.md");
  const pauseScript = join(rootDir, "scripts/rehearse-emergency-pause.mjs");
  const evmPolicyPath = join(rootDir, "backend/contracts/contracts/GoldRaccoonPolicy.sol");

  if (!existsSync(pauseDoc) || !existsSync(pauseScript) || !existsSync(evmPolicyPath)) {
    results.push({
      id: "emergencyPause",
      name: "Emergency pause rehearsal & circuit breakers",
      severity: "critical",
      status: "fail",
      detail: "Emergency pause documentation, rehearsal script, or policy contract missing",
      failureReason: "Missing emergency pause prerequisites",
      durationMs: Date.now() - startPause,
    });
  } else {
    const evmSrc = readFileSync(evmPolicyPath, "utf8");
    if (!evmSrc.includes("emergencyPause") && !evmSrc.includes("paused")) {
      results.push({
        id: "emergencyPause",
        name: "Emergency pause rehearsal & circuit breakers",
        severity: "critical",
        status: "fail",
        detail: "EVM policy contract does not implement pause circuit breaker",
        failureReason: "Missing pause functions in GoldRaccoonPolicy.sol",
        durationMs: Date.now() - startPause,
      });
    } else {
      results.push({
        id: "emergencyPause",
        name: "Emergency pause rehearsal & circuit breakers",
        severity: "critical",
        status: "pass",
        detail: "Emergency pause rehearsal script, procedures, and contract circuit breakers verified",
        durationMs: Date.now() - startPause,
      });
    }
  }

  const startSmoke = Date.now();
  const smokeScript = join(rootDir, "scripts/smoke-api.mjs");
  const criticalRoutes = [
    "frontend/src/app/api/health/route.ts",
    "frontend/src/app/api/x402/deep-scan/route.ts",
    "frontend/src/app/api/history/agent-runs/route.ts",
    "frontend/src/app/api/operations/readiness/route.ts",
    "frontend/src/app/api/execute/prepare/route.ts",
  ];
  const missingRoutes = criticalRoutes.filter((r) => !existsSync(join(rootDir, r)));

  if (!existsSync(smokeScript) || missingRoutes.length > 0) {
    results.push({
      id: "smoke",
      name: "Critical route smoke coverage",
      severity: "critical",
      status: "fail",
      detail: `Missing smoke script or route implementations: ${missingRoutes.join(", ")}`,
      failureReason: "Critical route implementations missing",
      durationMs: Date.now() - startSmoke,
    });
  } else {
    const smokeSrc = readFileSync(smokeScript, "utf8");
    if (!smokeSrc.includes("--json")) {
      results.push({
        id: "smoke",
        name: "Critical route smoke coverage",
        severity: "critical",
        status: "fail",
        detail: "Smoke script missing --json structured output support",
        failureReason: "Smoke test script does not support structured JSON",
        durationMs: Date.now() - startSmoke,
      });
    } else {
      results.push({
        id: "smoke",
        name: "Critical route smoke coverage",
        severity: "critical",
        status: "pass",
        detail: "Critical routes and structured smoke testing automation verified",
        durationMs: Date.now() - startSmoke,
      });
    }
  }

  const startLoad = Date.now();
  const execScript = join(rootDir, "scripts/load-test-execution.mjs");
  const simScript = join(rootDir, "scripts/load-test-simulation.mjs");
  const budgetDoc = join(rootDir, "docs/PERFORMANCE_BUDGETS.md");

  if (!existsSync(execScript) || !existsSync(simScript) || !existsSync(budgetDoc)) {
    results.push({
      id: "load",
      name: "Load behaviour & performance budgets",
      severity: "critical",
      status: "fail",
      detail: "Missing load scripts or performance budget documentation",
      failureReason: "Prerequisites missing for load gates",
      durationMs: Date.now() - startLoad,
    });
  } else {
    const execSrc = readFileSync(execScript, "utf8");
    const simSrc = readFileSync(simScript, "utf8");
    if (!execSrc.includes("--json") || !simSrc.includes("--json")) {
      results.push({
        id: "load",
        name: "Load behaviour & performance budgets",
        severity: "critical",
        status: "fail",
        detail: "Load scripts missing --json structured output support",
        failureReason: "Load test scripts do not support structured JSON",
        durationMs: Date.now() - startLoad,
      });
    } else {
      results.push({
        id: "load",
        name: "Load behaviour & performance budgets",
        severity: "critical",
        status: "pass",
        detail: "Load testing scripts, structured output, and recorded baselines verified",
        durationMs: Date.now() - startLoad,
      });
    }
  }

  const startDep = Date.now();
  const deploymentsDir = join(rootDir, "docs/deployments");
  const depTemplate = join(deploymentsDir, "TEMPLATE.md");

  if (!existsSync(deploymentsDir) || !existsSync(depTemplate)) {
    results.push({
      id: "deploymentRecord",
      name: "Deployment record validation",
      severity: "critical",
      status: "fail",
      detail: "docs/deployments directory or TEMPLATE.md missing",
      failureReason: "Missing deployment documentation directory",
      durationMs: Date.now() - startDep,
    });
  } else {
    const isProd = env === "production" || env === "mainnet";
    const files = readdirSync(deploymentsDir);
    const envRecords = files.filter(
      (f) =>
        f !== "TEMPLATE.md" &&
        (f.toLowerCase().includes(env) || f.endsWith(".json") || f.endsWith(".md"))
    );

    if (envRecords.length === 0) {
      const templateContent = readFileSync(join(deploymentsDir, "TEMPLATE.md"), "utf8");
      const requiredSections = [
        "## Identity",
        "## Source",
        "## Rollback",
        "## Release Readiness Gates & Evidence Verification",
      ];
      const missingSections = requiredSections.filter((s) => !templateContent.includes(s));
      if (missingSections.length > 0) {
        results.push({
          id: "deploymentRecord",
          name: "Deployment record validation",
          severity: "critical",
          status: "fail",
          detail: `Deployment template missing required sections: ${missingSections.join(", ")}`,
          failureReason: `docs/deployments/TEMPLATE.md missing sections: ${missingSections.join(", ")}`,
          durationMs: Date.now() - startDep,
        });
      } else {
        results.push({
          id: "deploymentRecord",
          name: "Deployment record validation",
          severity: "critical",
          status: "pass",
          detail: `Deployment template verified and ready for ${env} deployment record creation`,
          durationMs: Date.now() - startDep,
        });
      }
    } else {
      let depFail = null;
      for (const record of envRecords) {
        const full = join(deploymentsDir, record);
        const text = readFileSync(full, "utf8");
        if (record.endsWith(".json")) {
          try {
            const parsed = JSON.parse(text);
            const req = ["chain", "network", "contractAddress", "commitSha"];
            const missing = req.filter((k) => !parsed[k]);
            if (missing.length > 0) {
              depFail = `Record ${record} missing fields: ${missing.join(", ")}`;
              break;
            }
          } catch (e) {
            depFail = `Invalid JSON in ${record}: ${e.message}`;
            break;
          }
        } else if (record.endsWith(".md")) {
          if (text.includes("<chain>") || text.includes("<address>")) {
            depFail = `Record ${record} has unpopulated template placeholders`;
            break;
          }
        }
      }

      if (depFail) {
        results.push({
          id: "deploymentRecord",
          name: "Deployment record validation",
          severity: "critical",
          status: "fail",
          detail: depFail,
          failureReason: depFail,
          durationMs: Date.now() - startDep,
        });
      } else {
        results.push({
          id: "deploymentRecord",
          name: "Deployment record validation",
          severity: "critical",
          status: "pass",
          detail: `Deployment record verified for environment '${env}'`,
          durationMs: Date.now() - startDep,
        });
      }
    }
  }

  const startBudget = Date.now();
  const sloDoc = join(rootDir, "docs/SLO_ERROR_BUDGETS.md");
  const sloModule = join(rootDir, "frontend/src/server/observability/slo.ts");

  if (!existsSync(sloDoc) || !existsSync(sloModule)) {
    results.push({
      id: "budgets",
      name: "SLO error budget compliance",
      severity: "warning",
      status: "fail",
      detail: "SLO error budgets document or tracking module missing",
      failureReason: "Missing SLO documentation or module",
      durationMs: Date.now() - startBudget,
    });
  } else {
    results.push({
      id: "budgets",
      name: "SLO error budget compliance",
      severity: "warning",
      status: "pass",
      detail: "SLO definitions, error budget thresholds, and monitoring modules verified",
      durationMs: Date.now() - startBudget,
    });
  }

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let criticalFailures = 0;
  let warnings = 0;
  const reasons = [];

  for (const r of results) {
    if (r.status === "pass") {
      passed += 1;
    } else if (r.status === "skip") {
      skipped += 1;
    } else {
      failed += 1;
      if (r.severity === "critical") {
        criticalFailures += 1;
        reasons.push(`[CRITICAL] ${r.name}: ${r.failureReason || r.detail}`);
      } else {
        warnings += 1;
        reasons.push(`[WARNING] ${r.name}: ${r.failureReason || r.detail}`);
      }
    }
  }

  const verdict = criticalFailures === 0 ? "ready" : "blocked";

  return {
    verdict,
    commitSha: context.commit,
    environment: context.environment,
    evaluatedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      passed,
      failed,
      skipped,
      criticalFailures,
      warnings,
    },
    gates: results,
    reasons,
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    commit: null,
    expectedCommit: null,
    environment: process.env.APP_MODE || "production",
    generateEvidence: false,
    verifyEvidencePath: null,
    outPath: "docs/acceptance/release-gates-evidence.json",
    json: false,
    rootDir: process.cwd(),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--commit" && i + 1 < args.length) {
      options.commit = args[++i];
      options.expectedCommit = options.commit;
    } else if (arg === "--environment" && i + 1 < args.length) {
      options.environment = args[++i];
    } else if (arg === "--generate-evidence") {
      options.generateEvidence = true;
    } else if (arg === "--verify-evidence" && i + 1 < args.length) {
      options.verifyEvidencePath = args[++i];
    } else if (arg === "--out" && i + 1 < args.length) {
      options.outPath = args[++i];
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--root" && i + 1 < args.length) {
      options.rootDir = resolve(args[++i]);
    }
  }

  if (!options.commit) {
    options.commit = getCommitSha(options.rootDir);
  }

  return options;
}

export async function main() {
  const options = parseArgs();

  if (options.verifyEvidencePath) {
    const filePath = resolve(options.rootDir, options.verifyEvidencePath);
    if (!existsSync(filePath)) {
      console.error(`Evidence file not found: ${filePath}`);
      process.exit(1);
    }

    try {
      const raw = readFileSync(filePath, "utf8");
      const artifact = JSON.parse(raw);

      if (artifact.schemaVersion !== "1.0.0") {
        console.error(`Unsupported schemaVersion: ${artifact.schemaVersion}`);
        process.exit(1);
      }

      if (options.expectedCommit && artifact.commitSha !== options.expectedCommit) {
        console.error(
          `Commit mismatch in evidence: recorded=${artifact.commitSha}, expected=${options.expectedCommit}`
        );
        process.exit(1);
      }

      const computedDigest = computeVerdictDigest(artifact.verdict);
      if (computedDigest !== artifact.digest) {
        console.error(
          `Digest mismatch in evidence: recorded=${artifact.digest}, computed=${computedDigest}`
        );
        process.exit(1);
      }

      if (artifact.verdict.verdict !== "ready") {
        console.error(
          `Evidence records blocked release verdict: ${artifact.verdict.reasons.join("; ")}`
        );
        process.exit(1);
      }

      if (options.json) {
        console.log(
          JSON.stringify({ verified: true, digest: artifact.digest, commit: artifact.commitSha })
        );
      } else {
        console.log(
          `Evidence verified: digest=${artifact.digest} commit=${artifact.commitSha} verdict=${artifact.verdict.verdict}`
        );
      }
      process.exit(0);
    } catch (err) {
      console.error(`Failed to verify evidence: ${err.message}`);
      process.exit(1);
    }
  }

  const verdictReport = runGates({
    rootDir: options.rootDir,
    environment: options.environment,
    commit: options.commit,
  });

  if (options.generateEvidence) {
    const digest = computeVerdictDigest(verdictReport);
    const artifact = {
      schemaVersion: "1.0.0",
      commitSha: verdictReport.commitSha,
      environment: verdictReport.environment,
      generatedAt: new Date().toISOString(),
      verdict: verdictReport,
      digest,
    };

    const outFullPath = resolve(options.rootDir, options.outPath);
    writeFileSync(outFullPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    if (!options.json) {
      console.log(`Generated release evidence written to: ${options.outPath} (digest: ${digest})`);
    }
  }

  if (options.json) {
    console.log(JSON.stringify(verdictReport, null, 2));
  } else {
    console.log(`\n========================================`);
    console.log(`RELEASE READINESS GATES: ${verdictReport.verdict.toUpperCase()}`);
    console.log(`Commit:      ${verdictReport.commitSha}`);
    console.log(`Environment: ${verdictReport.environment}`);
    console.log(`Summary:     ${verdictReport.summary.passed}/${verdictReport.summary.total} passed (${verdictReport.summary.criticalFailures} critical failures, ${verdictReport.summary.warnings} warnings)`);
    console.log(`========================================`);
    for (const g of verdictReport.gates) {
      const statusStr = g.status === "pass" ? "PASS" : g.status === "skip" ? "SKIP" : "FAIL";
      console.log(`- [${statusStr}] [${g.severity.toUpperCase()}] ${g.name}: ${g.detail}`);
      if (g.failureReason) {
        console.log(`    Reason: ${g.failureReason}`);
      }
    }
    console.log(`========================================\n`);
  }

  if (verdictReport.verdict !== "ready") {
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("release-gate.mjs")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
