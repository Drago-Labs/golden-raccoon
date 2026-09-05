import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();
const nextDist = join(projectRoot, ".next");
const manifestPath = join(nextDist, "app-build-manifest.json");
const budgetsPath = join(projectRoot, "performance-budgets.json");

if (!fileExists(manifestPath)) {
  console.error("app-build-manifest.json not found. Run `next build` first.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const budgets = JSON.parse(readFileSync(budgetsPath, "utf8"));
const chunksDir = join(nextDist, "static", "chunks");

function fileExists(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

function getRouteSize(route: string): number {
  const pageChunks = manifest.pages[route];
  if (!pageChunks || !Array.isArray(pageChunks)) {
    console.warn(`No chunk info for route ${route});
    return 0;
  }
  let total = 0;
  for (const chunkName of pageChunks) {
    const chunkPath = join(chunksDir, chunkName);
    try {
      total += statSync(chunkPath).size;
    } catch {
      console.warn(`Chunk file not found: ${chunkPath}`);
    }
  }
  return total;
}

let failed = false;
for (const [route, budget] of Object.entries(budgets)) {
  const size = getRouteSize(route);
  const budgetBytes = Number(budget);
  console.log(`${route}: ${size} bytes (budget ${budgetBytes})`);
  if (size > budgetBytes) {
    console.error(`Route ${route} exceeds budget by ${size - budgetBytes} bytes`);
    failed = true;
  }
}

if (failed) {
  console.error("Bundle budget check failed.");
  process.exit(1);
}
