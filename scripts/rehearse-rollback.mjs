#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * Rehearses and validates rollback disable switches and execution safeguards.
 */
export function rehearseRollback(rootDir) {
  const start = Date.now();
  const checks = [];

  const providerHealthFile = join(rootDir, "frontend/src/server/observability/providerHealth.ts");
  const readinessFile = join(rootDir, "frontend/src/server/operations/releaseReadiness.ts");

  let providerHealthSrc = "";
  try {
    providerHealthSrc = readFileSync(providerHealthFile, "utf8");
    checks.push({
      name: "providerHealth module available",
      pass: true,
      detail: "frontend/src/server/observability/providerHealth.ts loaded",
    });
  } catch (err) {
    checks.push({
      name: "providerHealth module available",
      pass: false,
      detail: err.message,
    });
  }

  let readinessSrc = "";
  try {
    readinessSrc = readFileSync(readinessFile, "utf8");
    checks.push({
      name: "releaseReadiness module available",
      pass: true,
      detail: "frontend/src/server/operations/releaseReadiness.ts loaded",
    });
  } catch (err) {
    checks.push({
      name: "releaseReadiness module available",
      pass: false,
      detail: err.message,
    });
  }

  const expectedSwitches = [
    { key: "DISABLE_EXECUTION_PROVIDERS", desc: "Disables all execution providers" },
    { key: "RECOMMENDATION_ONLY_MODE", desc: "Forces recommendation-only mode" },
    { key: "DISABLE_EVM_SUBMISSION", desc: "Blocks EVM submission" },
    { key: "DISABLE_STELLAR_SUBMISSION", desc: "Blocks Stellar submission" },
    { key: "DISABLE_SUPABASE_WRITES", desc: "Skips database persistence writes" },
  ];

  for (const sw of expectedSwitches) {
    const declaredInHealth = providerHealthSrc.includes(sw.key);
    const declaredInReadiness = readinessSrc.includes(sw.key);
    const pass = declaredInHealth && declaredInReadiness;
    checks.push({
      name: `Switch declaration: ${sw.key}`,
      pass,
      detail: pass
        ? `Declared in providerHealth and releaseReadiness (${sw.desc})`
        : `Missing declaration in providerHealth (${declaredInHealth}) or releaseReadiness (${declaredInReadiness})`,
    });
  }

  const procedureDoc = join(rootDir, "docs/security/rollback-procedure.md");
  try {
    const docSrc = readFileSync(procedureDoc, "utf8");
    const hasDnsSection = docSrc.includes("DNS") || docSrc.includes("traffic");
    const hasSwitchSection = docSrc.includes("DISABLE_") || docSrc.includes("switch");
    const pass = hasDnsSection && hasSwitchSection;
    checks.push({
      name: "Rollback procedure documentation completeness",
      pass,
      detail: pass
        ? "Procedure defines traffic switching and emergency environment controls"
        : "Procedure missing traffic diversion or environment switch instructions",
    });
  } catch (err) {
    checks.push({
      name: "Rollback procedure documentation completeness",
      pass: false,
      detail: err.message,
    });
  }

  const passedCount = checks.filter((c) => c.pass).length;
  const failedCount = checks.length - passedCount;

  return {
    rehearsal: "rollback",
    status: failedCount === 0 ? "pass" : "fail",
    totalChecks: checks.length,
    passed: passedCount,
    failed: failedCount,
    durationMs: Date.now() - start,
    checks,
  };
}

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const rootDir = process.cwd();

const result = rehearseRollback(rootDir);

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Rollback Rehearsal: ${result.status.toUpperCase()}`);
  console.log(`Passed: ${result.passed}/${result.totalChecks} checks in ${result.durationMs}ms`);
  for (const c of result.checks) {
    console.log(`  [${c.pass ? "PASS" : "FAIL"}] ${c.name}: ${c.detail}`);
  }
}

if (result.status !== "pass") {
  process.exit(1);
}
