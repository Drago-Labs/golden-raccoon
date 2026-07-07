import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["frontend/src/app", "frontend/src/components", "frontend/src/server"];
const roadmapFile = "PROJECT_ROADMAP.md";
const requiredFiles = [
  roadmapFile,
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
  "frontend/src/app/operations/page.tsx",
];
const requiredReleaseMarkers = [
  "V1 Definition of Done",
  "Supabase",
  "Incident response",
  "Known limitations",
  "First 24",
  "Production env",
  "Smoke test",
  "Rollback",
  "V2 Definition of Done",
  "V3 Definition of Done",
];
const secretPattern = /(API_KEY=(?!\s|$)|cqt_[A-Za-z0-9]|sk-[A-Za-z0-9]|Bearer [A-Za-z0-9_\-]{16,}|0x[a-fA-F0-9]{64})/;
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const productionDeploy =
  process.env.VERCEL_ENV === "production" ||
  process.env.PRODUCTION_DEPLOY === "1" ||
  process.env.RELEASE_TARGET === "production";

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
  const files = sourceRoots
    .flatMap(walk)
    .concat([roadmapFile, "package.json", "frontend/package.json"])
    .filter((file) => existsSync(join(root, file)));

  for (const file of files) {
    const content = readFileSync(join(root, file), "utf8");
    const match = content.match(secretPattern);

    if (match && !content.includes("rsk-mainnet")) {
      fail(`possible secret-like value found in ${file}: ${match[0]}`);
    }
  }
}

function checkReleaseDocs() {
  const combinedDocs = existsSync(join(root, roadmapFile))
    ? readFileSync(join(root, roadmapFile), "utf8").toLowerCase()
    : "";

  for (const marker of requiredReleaseMarkers) {
    if (!combinedDocs.includes(marker.toLowerCase())) {
      fail(`release readiness docs are missing required marker: ${marker}`);
    }
  }
}

function checkVercelBuildGate() {
  for (const file of ["vercel.json", "frontend/vercel.json"]) {
    if (!existsSync(join(root, file))) {
      fail(`missing Vercel config: ${file}`);
      continue;
    }

    const content = readFileSync(join(root, file), "utf8");

    if (!content.includes("deploy:check")) {
      fail(`${file} buildCommand must run deploy:check before build`);
    }
  }
}

function checkProductionEnvironment() {
  if (!productionDeploy) {
    return;
  }

  const requiredEnv = [
    "NEXT_PUBLIC_APP_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GOAT_RPC_URL",
    "GOPLUS_API_KEY",
  ];
  const missing = requiredEnv.filter((key) => !process.env[key]);
  const portfolioProviderConfigured = Boolean(process.env.GOLDRUSH_API_KEY || process.env.COVALENT_API_KEY || process.env.ALCHEMY_API_KEY);
  const socialProviderConfigured = Boolean(
    process.env.SOCIAL_DATA_PROVIDER_URL ||
      process.env.APIFY_TOKEN ||
      process.env.TAVILY_API_KEY ||
      process.env.X_BEARER_TOKEN,
  );

  if (missing.length > 0) {
    fail(`production deploy env is incomplete: ${missing.join(", ")}`);
  }

  if (!portfolioProviderConfigured) {
    fail("production deploy requires at least one portfolio provider key: GOLDRUSH_API_KEY, COVALENT_API_KEY, or ALCHEMY_API_KEY");
  }

  if (!socialProviderConfigured) {
    fail("production deploy requires a social/search provider key or SOCIAL_DATA_PROVIDER_URL so Social Agent limits are explicit and measurable");
  }

  if (process.env.NEXT_PUBLIC_APP_URL?.includes("localhost")) {
    fail("production deploy NEXT_PUBLIC_APP_URL must not point to localhost");
  }
}

checkRequiredFiles();
checkIgnoredSourceFiles();
checkPathAliases();
checkSecrets();
checkReleaseDocs();
checkVercelBuildGate();
checkProductionEnvironment();

const schema = readFileSync(join(root, "frontend/src/server/storage/schema.sql"), "utf8");
for (const table of ["wallets", "agent_runs", "agent_results", "recommendations", "user_rules", "approvals", "transactions", "token_identities", "source_snapshots"]) {
  if (!schema.includes(`create table if not exists ${table}`)) {
    fail(`storage schema is missing table contract: ${table}`);
  }
}

if (!process.exitCode) {
  console.log("deploy-readiness: ok");
}
