import { MemoryStorageAdapter } from "../src/server/storage/adapters/memory";
import { PostgresStorageAdapter } from "../src/server/storage/adapters/postgres";
import { runConformanceSuite } from "../src/server/storage/conformance/suite";
import {
  createDivergentCoverageAdapter,
  createDivergentErrorMappingAdapter,
  createDivergentNullabilityAdapter,
  createDivergentOrderingAdapter,
} from "../src/server/storage/conformance/divergence";
import { createMigrationRunner } from "../src/server/storage/migrations/runner";
import { PGlite } from "@electric-sql/pglite";
import * as path from "node:path";

async function main() {
  console.log("=== Storage Adapter Conformance Suite ===\n");

  // 1. MemoryStorageAdapter
  console.log("Testing MemoryStorageAdapter...");
  const memoryAdapter = new MemoryStorageAdapter();
  const memoryReport = await runConformanceSuite(memoryAdapter, {
    reset: () => memoryAdapter.clear(),
  });
  console.log(
    `MemoryStorageAdapter passed: ${memoryReport.passedTests}/${memoryReport.totalTests} tests.`
  );

  // 2. PostgresStorageAdapter
  console.log("\nTesting PostgresStorageAdapter (PGlite)...");
  const db = new PGlite();
  const migrationsDir = path.resolve(__dirname, "../src/server/storage/migrations");
  const runner = createMigrationRunner(db, { migrationsDir });
  await runner.up();

  const postgresAdapter = new PostgresStorageAdapter(db);
  const postgresReport = await runConformanceSuite(postgresAdapter);
  console.log(
    `PostgresStorageAdapter passed: ${postgresReport.passedTests}/${postgresReport.totalTests} tests.`
  );

  // 3. Deliberate Divergence Detection
  console.log("\nVerifying Deliberate Divergence Detection...");

  // 3a. Ordering divergence
  const orderingDivergent = createDivergentOrderingAdapter(new MemoryStorageAdapter());
  let caughtOrdering = false;
  try {
    await runConformanceSuite(orderingDivergent);
  } catch (err: any) {
    const failed = err.failures?.some((f: any) => f.name.includes("ordering"));
    if (failed) {
      caughtOrdering = true;
      console.log("PASS: Detected deliberate ordering divergence.");
    }
  }
  if (!caughtOrdering) {
    throw new Error("FAIL: Divergent ordering adapter was not caught by conformance suite!");
  }

  // 3b. Nullability divergence
  const nullDivergent = createDivergentNullabilityAdapter(new MemoryStorageAdapter());
  let caughtNull = false;
  try {
    await runConformanceSuite(nullDivergent);
  } catch (err: any) {
    const failed = err.failures?.some((f: any) => f.name.includes("nullability"));
    if (failed) {
      caughtNull = true;
      console.log("PASS: Detected deliberate nullability divergence.");
    }
  }
  if (!caughtNull) {
    throw new Error("FAIL: Divergent nullability adapter was not caught by conformance suite!");
  }

  // 3c. Error mapping divergence
  const errorDivergent = createDivergentErrorMappingAdapter(new MemoryStorageAdapter());
  let caughtError = false;
  try {
    await runConformanceSuite(errorDivergent);
  } catch (err: any) {
    const failed = err.failures?.some((f: any) => f.name.includes("uniqueness"));
    if (failed) {
      caughtError = true;
      console.log("PASS: Detected deliberate error mapping divergence.");
    }
  }
  if (!caughtError) {
    throw new Error("FAIL: Divergent error mapping adapter was not caught by conformance suite!");
  }

  // 3d. Method coverage divergence
  const coverageDivergent = createDivergentCoverageAdapter(new MemoryStorageAdapter());
  let caughtCoverage = false;
  try {
    await runConformanceSuite(coverageDivergent);
  } catch (err: any) {
    const failed = err.failures?.some((f: any) => f.name.includes("coverage"));
    if (failed) {
      caughtCoverage = true;
      console.log("PASS: Detected deliberate un-conformed method addition.");
    }
  }
  if (!caughtCoverage) {
    throw new Error("FAIL: Uncovered method addition was not caught by conformance suite!");
  }

  console.log("\n=== All Storage Conformance Tests Passed Successfully! ===");
}

main().catch((err) => {
  console.error("\nStorage Conformance Suite Failed:", err);
  process.exit(1);
});
