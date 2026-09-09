import * as path from "node:path";
import * as fs from "node:fs";
import { detectSchemaDrift } from "../src/server/storage/migrations/runner";

async function main() {
  console.log("=== Schema Drift Detection Check ===");

  const migrationsDir = path.resolve(__dirname, "../src/server/storage/migrations");
  const schemaPath = path.resolve(__dirname, "../src/server/storage/schema.sql");

  if (!fs.existsSync(schemaPath)) {
    console.error(`schema.sql not found at: ${schemaPath}`);
    process.exit(1);
  }

  console.log("Comparing cumulative migrations schema against schema.sql definitions...");
  const driftResult = await detectSchemaDrift({
    schemaPath,
    migrationsDir,
  });

  if (driftResult.hasDrift) {
    console.error("\n[!] SCHEMA DRIFT DETECTED!");
    console.error(`Total Differences: ${driftResult.differences.length}`);
    for (const diff of driftResult.differences) {
      console.error(`  - ${diff}`);
    }
    process.exit(1);
  }

  console.log("\n[OK] Zero schema drift detected. Migrations faithfully produce schema.sql!");
}

main().catch((err) => {
  console.error("Schema drift check failed with error:", err);
  process.exit(1);
});
