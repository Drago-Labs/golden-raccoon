import { PGlite } from "@electric-sql/pglite";
import * as path from "node:path";
import {
  createMigrationRunner,
  loadMigrationDescriptors,
  verifyMigrationLifecycle,
  executeSqlScript,
} from "../src/server/storage/migrations/runner";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "verify";
  const migrationsDir = path.resolve(__dirname, "../src/server/storage/migrations");

  console.log(`=== Storage Migration Runner [${command}] ===`);
  console.log(`Migrations Directory: ${migrationsDir}`);

  const db = new PGlite();
  const runner = createMigrationRunner(db, { migrationsDir });
  const allDescriptors = loadMigrationDescriptors(migrationsDir);

  if (command === "status") {
    const applied = await runner.status();
    const appliedMap = new Map(applied.map((r) => [r.name, r]));

    console.log(`Total Available Migrations: ${allDescriptors.length}`);
    console.log(`Applied Count: ${applied.length}`);
    console.log(`Pending Count: ${allDescriptors.length - applied.length}`);
    console.log("\nLedger Status:");
    for (const m of allDescriptors) {
      const isApplied = appliedMap.has(m.name);
      const mark = isApplied ? "[x]" : "[ ]";
      const rec = appliedMap.get(m.name);
      const checksum = (rec?.checksum || m.checksum).substring(0, 12);
      console.log(`  ${mark} ${m.name} - Checksum: ${checksum}...`);
    }
  } else if (command === "up") {
    const result = await runner.up();
    console.log(`Successfully applied ${result.applied.length} migrations:`);
    for (const m of result.applied) {
      console.log(`  - ${m.name}`);
    }
  } else if (command === "down") {
    const result = await runner.down();
    console.log(`Rolled back migration: ${result.rolledBack.name}`);
  } else if (command === "verify") {
    console.log("Verifying complete migration lifecycle for all migrations with rollback scripts...");
    for (let i = 0; i < allDescriptors.length; i++) {
      const migration = allDescriptors[i];
      if (!migration.rollbackSql) {
        console.log(`Skipping lifecycle verification for ${migration.name} (no rollback script)`);
        continue;
      }
      console.log(`  Verifying lifecycle: ${migration.name}...`);
      const testDb = new PGlite();
      for (let j = 0; j < i; j++) {
        await executeSqlScript(testDb, allDescriptors[j].forwardSql);
      }
      await verifyMigrationLifecycle(testDb, migration);
      console.log(`  [OK] ${migration.name} lifecycle verified (forward -> validate -> rollback -> re-apply).`);
    }
    console.log("All migration lifecycles verified successfully!");
  } else {
    console.error(`Unknown command: ${command}. Use 'status', 'up', 'down', or 'verify'.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Migration execution failed:", err);
  process.exit(1);
});
