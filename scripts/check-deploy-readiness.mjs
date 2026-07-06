import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["frontend/src/app", "frontend/src/components", "frontend/src/server"];
const requiredFiles = [
  "frontend/src/server/cache/strategy.ts",
  "frontend/src/server/env/validation.ts",
  "frontend/src/server/security/policy.ts",
  "frontend/src/server/security/rateLimit.ts",
  "frontend/src/server/security/inputValidation.ts",
  "frontend/src/server/security/urlSafety.ts",
  "frontend/src/server/observability/logging.ts",
  "frontend/src/server/observability/metrics.ts",
  "frontend/src/server/observability/health.ts",
  "frontend/src/server/observability/alerts.ts",
  "frontend/src/server/evaluation/goldenFixtures.ts",
  "frontend/src/server/evaluation/properties.ts",
  "frontend/src/server/evaluation/replay.ts",
  "frontend/src/server/storage/index.ts",
  "frontend/src/server/storage/schema.sql",
  "frontend/src/server/agents/execution/policy.ts",
  "frontend/src/app/api/health/route.ts",
  "frontend/src/app/api/history/agent-runs/route.ts",
  "frontend/src/app/api/history/agent-runs/[id]/route.ts",
  "frontend/src/app/api/history/approvals/route.ts",
  "frontend/src/app/api/history/recommendations/route.ts",
];
const secretPattern = /(API_KEY=|cqt_[A-Za-z0-9]|sk-[A-Za-z0-9]|Bearer [A-Za-z0-9_\-]{16,}|0x[a-fA-F0-9]{64})/;
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);

function fail(message) {
  console.error(`deploy-readiness: ${message}`);
  process.exitCode = 1;
}

function walk(dir) {
  const absoluteDir = join(root, dir);

  if (!existsSync(absoluteDir)) {
    return [];
  }

  return readdirSync(absoluteDir).flatMap((entry) => {
    const absolutePath = join(absoluteDir, entry);
    const relativePath = relative(root, absolutePath);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      return walk(relativePath);
    }

    return sourceExtensions.has(extname(entry)) ? [relativePath] : [];
  });
}

function checkRequiredFiles() {
  for (const file of requiredFiles) {
    if (!existsSync(join(root, file))) {
      fail(`required source file is missing: ${file}`);
    }
  }
}

function checkIgnoredSourceFiles() {
  const files = requiredFiles.filter((file) => existsSync(join(root, file)));

  if (files.length === 0) {
    return;
  }

  const result = spawnSync("git", ["check-ignore", ...files], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.status === 0 && result.stdout.trim()) {
    fail(`required source file is ignored by git: ${result.stdout.trim().replaceAll("\n", ", ")}`);
  }
}

function checkPathAliases() {
  const files = sourceRoots.flatMap(walk);
  const importPattern = /from\s+["']@\/([^"']+)["']|import\(["']@\/([^"']+)["']\)/g;

  for (const file of files) {
    const content = readFileSync(join(root, file), "utf8");

    for (const match of content.matchAll(importPattern)) {
      const target = match[1] || match[2];
      const candidateBase = join(root, "frontend/src", target);
      const candidates = [
        candidateBase,
        `${candidateBase}.ts`,
        `${candidateBase}.tsx`,
        `${candidateBase}.js`,
        `${candidateBase}.jsx`,
        join(candidateBase, "index.ts"),
        join(candidateBase, "index.tsx"),
      ];

      if (!candidates.some(existsSync)) {
        fail(`${file} imports missing alias module @/${target}`);
      }
    }
  }
}

function checkSecrets() {
  const files = sourceRoots.flatMap(walk).concat(["REAL_AGENT_TODO.md", "package.json", "frontend/package.json"]).filter((file) => existsSync(join(root, file)));

  for (const file of files) {
    const content = readFileSync(join(root, file), "utf8");
    const match = content.match(secretPattern);

    if (match && !content.includes("rsk-mainnet")) {
      fail(`possible secret-like value found in ${file}: ${match[0]}`);
    }
  }
}

checkRequiredFiles();
checkIgnoredSourceFiles();
checkPathAliases();
checkSecrets();

const schema = readFileSync(join(root, "frontend/src/server/storage/schema.sql"), "utf8");
for (const table of ["wallets", "agent_runs", "agent_results", "recommendations", "user_rules", "approvals", "transactions", "token_identities", "source_snapshots"]) {
  if (!schema.includes(`create table if not exists ${table}`)) {
    fail(`storage schema is missing table contract: ${table}`);
  }
}

if (!process.exitCode) {
  console.log("deploy-readiness: ok");
}
