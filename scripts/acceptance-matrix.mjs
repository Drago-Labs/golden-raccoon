#!/usr/bin/env node
/**
 * V1 acceptance matrix runner.
 *
 * Runs every case in `docs/V1_ACCEPTANCE_MATRIX.md` that can be executed
 * without a human, records exactly what happened, and writes a machine-readable
 * evidence file.
 *
 * The governing rule is that this script reports only what it observed. Cases
 * that need a browser, a device, a funded wallet or a deployed URL are emitted
 * as `not_run` with the reason, never as `pass`. A completion report assembled
 * from this output therefore cannot claim coverage that was never exercised —
 * which is the failure mode the acceptance issue explicitly rules out.
 *
 * Usage:
 *   node scripts/acceptance-matrix.mjs [--out <path>] [--skip-build]
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = { skipBuild: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--skip-build") {
      args.skipBuild = true;
    } else if (token === "--out") {
      args.out = argv[index + 1];
      index += 1;
    } else {
      console.error(`acceptance-matrix: unknown argument "${token}"`);
      process.exit(1);
    }
  }

  return args;
}

function capture(command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });

  return {
    command: [command, ...args].join(" "),
    exitCode: result.status,
    durationMs: Date.now() - started,
    // Tails only: a full build log is not evidence, the outcome is. Keeping the
    // last lines preserves the failure message when there is one.
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr),
    signal: result.signal ?? null,
    spawnError: result.error ? result.error.message : null,
  };
}

function tail(value, lines = 12) {
  if (!value) {
    return "";
  }

  return value.trimEnd().split("\n").slice(-lines).join("\n");
}

function version(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });

  return result.status === 0 ? (result.stdout ?? "").trim().split("\n")[0] : "unavailable";
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });

  return result.status === 0 ? (result.stdout ?? "").trim() : "unknown";
}

/**
 * The automatable half of the matrix.
 *
 * `id` matches the case id in the matrix document so the report and the
 * document cannot drift apart silently.
 */
function automatedCases({ skipBuild }) {
  return [
    {
      id: "A1",
      title: "Deploy readiness and secret scan",
      run: () => capture("npm", ["run", "deploy:check"]),
    },
    {
      id: "A2",
      title: "Stellar configuration check",
      run: () => capture("npm", ["run", "test:stellar-config"]),
    },
    {
      id: "A3",
      title: "Agent fixture and property suite",
      run: () => capture("npm", ["run", "test:agents"]),
    },
    {
      id: "A4",
      title: "Lint",
      run: () => capture("npm", ["run", "lint"]),
    },
    {
      id: "A5",
      title: "Production build",
      skip: skipBuild ? "skipped by --skip-build" : null,
      run: () => capture("npm", ["run", "build"]),
    },
    {
      id: "A6",
      title: "Soroban contract tests",
      run: () => capture("cargo", ["test", "--manifest-path", "soroban/Cargo.toml"]),
    },
    {
      id: "A7",
      title: "EVM contract compile",
      run: () => capture("npx", ["hardhat", "compile"], { cwd: join(root, "backend/contracts") }),
    },
  ];
}

/**
 * Cases that cannot be executed by this script, with the reason.
 *
 * These are emitted so the matrix is complete and the gaps are visible. A
 * reader can see at a glance what still needs a human, a device, or a deployed
 * environment — rather than reading an all-green table that quietly omits them.
 */
const MANUAL_CASES = [
  { id: "M1", title: "Contract-address input flow on desktop", reason: "needs a browser against a deployed build" },
  { id: "M2", title: "DexScreener link input flow on desktop", reason: "needs a browser against a deployed build" },
  { id: "M3", title: "Native XLM input", reason: "needs a browser and live Stellar provider data" },
  { id: "M4", title: "Classic Stellar asset input", reason: "needs a browser and live Stellar provider data" },
  { id: "M5", title: "Soroban contract asset input", reason: "needs a browser and live Stellar provider data" },
  { id: "M6", title: "EVM wallet connected", reason: "needs a real wallet extension and user signature" },
  { id: "M7", title: "EVM wallet disconnected", reason: "needs a browser session" },
  { id: "M8", title: "Stellar wallet connected", reason: "needs a real wallet and user signature" },
  { id: "M9", title: "Stellar wallet disconnected", reason: "needs a browser session" },
  { id: "M10", title: "Report comprehension review", reason: "human judgement on Buy Risk, confidence, verdict, reasons, sources, missing data, execution boundary" },
  { id: "M11", title: "Mobile viewport acceptance", reason: "needs a real device or device emulation" },
  { id: "M12", title: "x402 payment-required (402) flow", reason: "needs the deployed x402 route and a facilitator" },
  { id: "M13", title: "x402 verified payment flow", reason: "needs a funded wallet on the payment network" },
  { id: "M14", title: "x402 failed payment flow", reason: "needs a facilitator that can reject a payment" },
  { id: "M15", title: "x402 duplicate payment flow", reason: "needs a replayed payment header against the deployed route" },
  { id: "M16", title: "Smoke suite against the deployment URL", reason: "needs SMOKE_BASE_URL pointing at a running deployment" },
  { id: "M17", title: "Supabase migration applied to a clean database", reason: "needs a database; blocked by #1" },
  { id: "M18", title: "No production path returns mock data", reason: "needs live provider credentials to observe real responses" },
];

function classify(execution) {
  if (execution.spawnError) {
    return "error";
  }

  return execution.exitCode === 0 ? "pass" : "fail";
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const environment = {
    commit: git(["rev-parse", "HEAD"]),
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    workingTreeClean: git(["status", "--porcelain"]) === "",
    startedAt: new Date().toISOString(),
    platform: `${process.platform} ${process.arch}`,
    node: process.version,
    npm: version("npm", ["--version"]),
    rustc: version("rustc", ["--version"]),
    cargo: version("cargo", ["--version"]),
    stellarCli: version("stellar", ["--version"]),
    // Recorded because a result is only meaningful alongside the mode that
    // produced it: a suite passing in demo mode says nothing about live.
    appMode: process.env.APP_MODE ?? process.env.NEXT_PUBLIC_APP_MODE ?? "unset (defaults to live)",
    smokeBaseUrl: process.env.SMOKE_BASE_URL ?? "unset",
    vercelEnv: process.env.VERCEL_ENV ?? "unset",
  };

  console.log(`commit:   ${environment.commit}`);
  console.log(`branch:   ${environment.branch}`);
  console.log(`clean:    ${environment.workingTreeClean}`);
  console.log(`app mode: ${environment.appMode}\n`);

  const results = [];

  for (const testCase of automatedCases(args)) {
    if (testCase.skip) {
      console.log(`- ${testCase.id} ${testCase.title}: not_run (${testCase.skip})`);
      results.push({ id: testCase.id, title: testCase.title, status: "not_run", reason: testCase.skip });
      continue;
    }

    process.stdout.write(`- ${testCase.id} ${testCase.title}: `);
    const execution = testCase.run();
    const status = classify(execution);
    console.log(`${status} (${Math.round(execution.durationMs / 1000)}s)`);
    results.push({ id: testCase.id, title: testCase.title, status, ...execution });
  }

  for (const manual of MANUAL_CASES) {
    results.push({ id: manual.id, title: manual.title, status: "not_run", reason: manual.reason });
  }

  const summary = results.reduce(
    (counts, result) => ({ ...counts, [result.status]: (counts[result.status] ?? 0) + 1 }),
    {},
  );

  const record = {
    matrix: "docs/V1_ACCEPTANCE_MATRIX.md",
    environment,
    finishedAt: new Date().toISOString(),
    summary,
    results,
  };

  const outPath = args.out ? resolve(root, args.out) : join(root, "docs/acceptance/evidence.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);

  console.log(`\nsummary: ${JSON.stringify(summary)}`);
  console.log(`evidence written to ${outPath.replace(`${root}/`, "")}`);

  // A failing automated case fails the run. Cases that were never executed do
  // not, because "not run" is a reported gap rather than a broken gate.
  if ((summary.fail ?? 0) > 0 || (summary.error ?? 0) > 0) {
    process.exitCode = 1;
  }
}

main();
