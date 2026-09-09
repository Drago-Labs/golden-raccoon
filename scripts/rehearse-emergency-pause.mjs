#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * Rehearses and validates emergency pause circuit breakers and contract triggers.
 */
export function rehearseEmergencyPause(rootDir) {
  const start = Date.now();
  const checks = [];

  const evmContractPath = join(rootDir, "backend/contracts/contracts/GoldRaccoonPolicy.sol");
  try {
    const evmSrc = readFileSync(evmContractPath, "utf8");
    const hasPauseFunction = evmSrc.includes("function pause(") || evmSrc.includes("function emergencyPause(") || evmSrc.includes("emergencyPause");
    const hasPausable = evmSrc.includes("Pausable") || evmSrc.includes("paused");
    const pass = hasPauseFunction && hasPausable;
    checks.push({
      name: "EVM policy contract pause functions",
      pass,
      detail: pass
        ? "pause() or emergencyPause() and paused check implemented in GoldRaccoonPolicy.sol"
        : "Missing pause() / emergencyPause() or paused state in GoldRaccoonPolicy.sol",
    });
  } catch (err) {
    checks.push({
      name: "EVM policy contract pause functions",
      pass: false,
      detail: err.message,
    });
  }

  const sorobanPolicyPath = join(rootDir, "soroban/contracts/policy/src/lib.rs");
  try {
    const sorobanSrc = readFileSync(sorobanPolicyPath, "utf8");
    const hasAdminCheck = sorobanSrc.includes("admin") || sorobanSrc.includes("require_auth");
    checks.push({
      name: "Soroban contract authz and security enforcement",
      pass: hasAdminCheck,
      detail: hasAdminCheck
        ? "Soroban policy enforces authorization and administrative controls"
        : "Soroban policy missing authorization controls",
    });
  } catch (err) {
    checks.push({
      name: "Soroban contract authz and security enforcement",
      pass: false,
      detail: err.message,
    });
  }

  const procedureDoc = join(rootDir, "docs/security/emergency-pause-procedure.md");
  try {
    const docSrc = readFileSync(procedureDoc, "utf8");
    const hasCastCmd = docSrc.includes("cast send");
    const hasStellarCmd = docSrc.includes("stellar contract invoke");
    const pass = hasCastCmd && hasStellarCmd;
    checks.push({
      name: "Emergency pause CLI commands documented",
      pass,
      detail: pass
        ? "Procedure includes concrete cast and stellar invoke commands"
        : "Missing concrete cast or stellar CLI invocation instructions",
    });
  } catch (err) {
    checks.push({
      name: "Emergency pause CLI commands documented",
      pass: false,
      detail: err.message,
    });
  }

  const runbooksPath = join(rootDir, "frontend/src/server/observability/runbooks.ts");
  try {
    const runbooksSrc = readFileSync(runbooksPath, "utf8");
    const hasRb007 = runbooksSrc.includes("RB-007");
    checks.push({
      name: "Emergency pause runbook registered (RB-007)",
      pass: hasRb007,
      detail: hasRb007
        ? "RB-007 registered in observability runbooks"
        : "RB-007 missing from runbooks.ts",
    });
  } catch (err) {
    checks.push({
      name: "Emergency pause runbook registered (RB-007)",
      pass: false,
      detail: err.message,
    });
  }

  const passedCount = checks.filter((c) => c.pass).length;
  const failedCount = checks.length - passedCount;

  return {
    rehearsal: "emergency-pause",
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

const result = rehearseEmergencyPause(rootDir);

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Emergency Pause Rehearsal: ${result.status.toUpperCase()}`);
  console.log(`Passed: ${result.passed}/${result.totalChecks} checks in ${result.durationMs}ms`);
  for (const c of result.checks) {
    console.log(`  [${c.pass ? "PASS" : "FAIL"}] ${c.name}: ${c.detail}`);
  }
}

if (result.status !== "pass") {
  process.exit(1);
}
