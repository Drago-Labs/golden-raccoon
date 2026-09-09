import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as path from "node:path";
import * as fs from "node:fs";
import { MemoryStorageAdapter } from "../../adapters/memory";
import { PostgresStorageAdapter } from "../../adapters/postgres";
import {
  runConformanceSuite,
  ConformanceSuiteError,
} from "../suite";
import {
  createDivergentOrderingAdapter,
  createDivergentNullabilityAdapter,
  createDivergentErrorMappingAdapter,
  createDivergentCoverageAdapter,
} from "../divergence";
import {
  applyMigrations,
  createMigrationRunner,
  loadMigrationDescriptors,
  detectSchemaDrift,
  MigrationChecksumMismatchError,
} from "../../migrations/runner";

describe("Storage Adapter Conformance Suite", () => {
  it("passes 18/18 conformance checks against MemoryStorageAdapter", async () => {
    const memory = new MemoryStorageAdapter();
    const report = await runConformanceSuite(memory, {
      reset: () => memory.clear(),
    });
    expect(report.totalTests).toBe(18);
    expect(report.passedTests).toBe(18);
    expect(report.failedTests).toBe(0);
  });

  it("passes 18/18 conformance checks against PostgresStorageAdapter", async () => {
    const db = new PGlite();
    const migrationsDir = path.resolve(__dirname, "../../migrations");
    const runner = createMigrationRunner(db, { migrationsDir });
    await runner.up();

    const pgAdapter = new PostgresStorageAdapter(db);
    const report = await runConformanceSuite(pgAdapter);
    expect(report.totalTests).toBe(18);
    expect(report.passedTests).toBe(18);
    expect(report.failedTests).toBe(0);
  });

  it("fails when an adapter exhibits ordering divergence", async () => {
    const base = new MemoryStorageAdapter();
    const divergent = createDivergentOrderingAdapter(base);
    await expect(runConformanceSuite(divergent, { reset: () => base.clear() })).rejects.toThrow(ConformanceSuiteError);
  });

  it("fails when an adapter exhibits nullability divergence", async () => {
    const base = new MemoryStorageAdapter();
    const divergent = createDivergentNullabilityAdapter(base);
    await expect(runConformanceSuite(divergent, { reset: () => base.clear() })).rejects.toThrow(ConformanceSuiteError);
  });

  it("fails when an adapter exhibits error taxonomy mapping divergence", async () => {
    const base = new MemoryStorageAdapter();
    const divergent = createDivergentErrorMappingAdapter(base);
    await expect(runConformanceSuite(divergent, { reset: () => base.clear() })).rejects.toThrow(ConformanceSuiteError);
  });

  it("fails if an adapter defines methods not covered by conformance assertions", async () => {
    const base = new MemoryStorageAdapter();
    const divergent = createDivergentCoverageAdapter(base);
    await expect(runConformanceSuite(divergent, { reset: () => base.clear() })).rejects.toThrow(ConformanceSuiteError);
  });
});

describe("Migration Runner Lifecycle and Drift Detection", () => {
  const migrationsDir = path.resolve(__dirname, "../../migrations");

  it("is idempotent: running up() twice leaves ledger unchanged", async () => {
    const db = new PGlite();
    const runner = createMigrationRunner(db, { migrationsDir });

    const firstRun = await runner.up();
    expect(firstRun.applied.length).toBeGreaterThan(0);

    const secondRun = await runner.up();
    expect(secondRun.applied.length).toBe(0);
    expect(secondRun.skippedCount).toBe(firstRun.applied.length);
  });

  it("enforces SHA-256 checksums on previously applied migrations", async () => {
    const db = new PGlite();
    await applyMigrations(db, { migrationsDir });

    const descriptors = loadMigrationDescriptors(migrationsDir);
    const tampered = descriptors.map((d, index) => {
      if (index === 0) {
        return {
          ...d,
          checksum: "0000000000000000000000000000000000000000000000000000000000000000",
        };
      }
      return d;
    });

    await expect(
      applyMigrations(db, { migrations: tampered })
    ).rejects.toThrow(MigrationChecksumMismatchError);
  });

  it("detects zero schema drift between migrations and cumulative schema.sql", async () => {
    const schemaPath = path.resolve(__dirname, "../../schema.sql");
    const drift = await detectSchemaDrift({
      schemaPath,
      migrationsDir,
    });
    expect(drift.hasDrift).toBe(false);
    expect(drift.differences.length).toBe(0);
  });

  it("detects schema drift when a table is added without a migration", async () => {
    const tempSchemaPath = path.resolve(__dirname, "../../schema.temp.test.sql");
    const originalSql = fs.readFileSync(path.resolve(__dirname, "../../schema.sql"), "utf-8");
    fs.writeFileSync(
      tempSchemaPath,
      originalSql + "\ncreate table unmigrated_shadow_table (id text primary key, secret text not null);"
    );
    try {
      const drift = await detectSchemaDrift({
        schemaPath: tempSchemaPath,
        migrationsDir,
      });
      expect(drift.hasDrift).toBe(true);
      expect(drift.differences.some((d) => d.includes("unmigrated_shadow_table"))).toBe(true);
    } finally {
      if (fs.existsSync(tempSchemaPath)) {
        fs.unlinkSync(tempSchemaPath);
      }
    }
  });
});
