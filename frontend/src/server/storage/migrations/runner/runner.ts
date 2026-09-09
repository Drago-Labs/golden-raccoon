import fs from "node:fs";
import path from "node:path";
import { computeMigrationChecksum } from "./checksum";
import {
  ensureMigrationLedgerTable,
  getAppliedMigrations,
  recordMigrationInLedger,
  removeMigrationFromLedger,
  type MigrationLedgerRecord,
  type SqlExecutor,
} from "./ledger";

export interface MigrationDescriptor {
  name: string;
  filename: string;
  filepath: string;
  forwardSql: string;
  rollbackSql?: string;
  rollbackFilepath?: string;
  validateSql?: string;
  validateFilepath?: string;
  checksum: string;
}

export interface MigrationResult {
  appliedCount: number;
  applied: {
    name: string;
    checksum: string;
    executionTimeMs: number;
  }[];
  skippedCount: number;
  totalInLedger: number;
}

export interface RollbackResult {
  rolledBackMigration: string;
  remainingInLedger: number;
}

export class MigrationChecksumMismatchError extends Error {
  readonly migrationName: string;
  readonly recordedChecksum: string;
  readonly currentChecksum: string;

  /**
   * Constructs a checksum mismatch error.
   *
   * @param migrationName Name of the modified migration.
   * @param recordedChecksum Hash previously recorded in the database.
   * @param currentChecksum Hash computed from disk file.
   */
  constructor(migrationName: string, recordedChecksum: string, currentChecksum: string) {
    super(
      `Migration checksum mismatch for "${migrationName}". ` +
      `Recorded in ledger: "${recordedChecksum}", disk file: "${currentChecksum}". ` +
      `Applied migrations must never be modified in place.`,
    );
    this.name = "MigrationChecksumMismatchError";
    this.migrationName = migrationName;
    this.recordedChecksum = recordedChecksum;
    this.currentChecksum = currentChecksum;
  }
}

/**
 * Splits a SQL string into individual executable statements, respecting dollar-quoted blocks,
 * string literals, and comment blocks.
 *
 * @param sql Combined SQL string.
 * @returns Array of individual SQL statements.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDollarQuote = false;
  let dollarTag = "";
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      current += char;
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        inBlockComment = false;
        current += "*/";
        i++;
        continue;
      }
      current += char;
      continue;
    }

    if (!inSingleQuote && !inDollarQuote) {
      if (char === "-" && nextChar === "-") {
        inLineComment = true;
        current += "--";
        i++;
        continue;
      }
      if (char === "/" && nextChar === "*") {
        inBlockComment = true;
        current += "/*";
        i++;
        continue;
      }
    }

    if (inDollarQuote) {
      current += char;
      if (char === "$" && current.endsWith(dollarTag)) {
        inDollarQuote = false;
        dollarTag = "";
      }
      continue;
    }

    if (inSingleQuote) {
      current += char;
      if (char === "'") {
        if (nextChar === "'") {
          current += "'";
          i++;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }

    if (char === "$") {
      const match = sql.slice(i).match(/^\$([a-zA-Z0-9_]*)\$/);
      if (match) {
        inDollarQuote = true;
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length - 1;
        continue;
      }
    }

    if (char === ";") {
      if (current.trim()) {
        statements.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

/**
 * Executes a SQL script against an executor, using exec when available or running split statements.
 *
 * @param executor SQL execution interface.
 * @param sql Multi-statement SQL script.
 */
export async function executeSqlScript(executor: SqlExecutor, sql: string): Promise<void> {
  if (typeof executor.exec === "function") {
    await executor.exec(sql);
    return;
  }

  const statements = splitSqlStatements(sql);
  for (const statement of statements) {
    await executor.query(statement);
  }
}

/**
 * Loads and parses all migration descriptors from disk in strict alphabetical order.
 *
 * @param migrationsDir Directory containing migration sql files. Defaults to standard storage migrations dir.
 * @returns Array of sorted migration descriptors.
 */
export function loadMigrationDescriptors(migrationsDir?: string): MigrationDescriptor[] {
  const dir = migrationsDir ?? path.join(process.cwd(), "src/server/storage/migrations");
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const migrationFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .filter((name) => !name.endsWith(".rollback.sql") && !name.endsWith(".validate.sql"))
    .sort();

  return migrationFiles.map((filename) => {
    const name = filename.replace(/\.sql$/, "");
    const filepath = path.join(dir, filename);
    const forwardSql = fs.readFileSync(filepath, "utf8");
    const checksum = computeMigrationChecksum(forwardSql);

    const rollbackFilename = `${name}.rollback.sql`;
    const rollbackFilepath = path.join(dir, rollbackFilename);
    const rollbackSql = fs.existsSync(rollbackFilepath)
      ? fs.readFileSync(rollbackFilepath, "utf8")
      : undefined;

    const validateFilename = `${name}.validate.sql`;
    const validateFilepath = path.join(dir, validateFilename);
    const validateSql = fs.existsSync(validateFilepath)
      ? fs.readFileSync(validateFilepath, "utf8")
      : undefined;

    return {
      name,
      filename,
      filepath,
      forwardSql,
      rollbackSql,
      rollbackFilepath: rollbackSql !== undefined ? rollbackFilepath : undefined,
      validateSql,
      validateFilepath: validateSql !== undefined ? validateFilepath : undefined,
      checksum,
    };
  });
}

/**
 * Applies all pending migrations in alphabetical order with ledger verification and checksum enforcement.
 *
 * @param executor Target SQL executor.
 * @param options Configuration options including custom directory or migration descriptors.
 * @returns Summary of applied migrations.
 */
export async function applyMigrations(
  executor: SqlExecutor,
  options?: {
    migrationsDir?: string;
    migrations?: MigrationDescriptor[];
  },
): Promise<MigrationResult> {
  await ensureMigrationLedgerTable(executor);
  const migrations = options?.migrations ?? loadMigrationDescriptors(options?.migrationsDir);
  const appliedLedger = await getAppliedMigrations(executor);
  const appliedMap = new Map<string, MigrationLedgerRecord>(
    appliedLedger.map((record) => [record.name, record]),
  );

  for (const migration of migrations) {
    const recorded = appliedMap.get(migration.name);
    if (recorded) {
      if (recorded.checksum !== migration.checksum) {
        throw new MigrationChecksumMismatchError(
          migration.name,
          recorded.checksum,
          migration.checksum,
        );
      }
    }
  }

  const pendingMigrations = migrations.filter((m) => !appliedMap.has(m.name));
  const appliedList: MigrationResult["applied"] = [];

  for (const migration of pendingMigrations) {
    const startTime = Date.now();
    await executeSqlScript(executor, migration.forwardSql);

    if (migration.validateSql) {
      await executeSqlScript(executor, migration.validateSql);
    }

    const executionTimeMs = Date.now() - startTime;
    await recordMigrationInLedger(executor, {
      name: migration.name,
      checksum: migration.checksum,
      executionTimeMs,
    });

    appliedList.push({
      name: migration.name,
      checksum: migration.checksum,
      executionTimeMs,
    });
  }

  const totalInLedger = (await getAppliedMigrations(executor)).length;

  return {
    appliedCount: appliedList.length,
    applied: appliedList,
    skippedCount: migrations.length - pendingMigrations.length,
    totalInLedger,
  };
}

/**
 * Rolls back the most recently applied migration recorded in the ledger.
 *
 * @param executor Target SQL executor.
 * @param options Configuration options.
 * @returns Details of rolled back migration.
 */
export async function rollbackLastMigration(
  executor: SqlExecutor,
  options?: {
    migrationsDir?: string;
    migrations?: MigrationDescriptor[];
  },
): Promise<RollbackResult> {
  const appliedLedger = await getAppliedMigrations(executor);
  if (appliedLedger.length === 0) {
    throw new Error("No migrations found in ledger to roll back.");
  }

  const lastApplied = appliedLedger[appliedLedger.length - 1];
  const migrations = options?.migrations ?? loadMigrationDescriptors(options?.migrationsDir);
  const descriptor = migrations.find((m) => m.name === lastApplied.name);

  if (!descriptor) {
    throw new Error(`Migration file for "${lastApplied.name}" not found on disk.`);
  }

  if (!descriptor.rollbackSql) {
    throw new Error(`Migration "${lastApplied.name}" does not possess a rollback script.`);
  }

  await executeSqlScript(executor, descriptor.rollbackSql);
  await removeMigrationFromLedger(executor, descriptor.name);

  const remaining = await getAppliedMigrations(executor);
  return {
    rolledBackMigration: descriptor.name,
    remainingInLedger: remaining.length,
  };
}

/**
 * Verifies that a migration applies, rolls back, and re-applies cleanly against the target executor.
 *
 * @param executor Target SQL executor.
 * @param migration Target migration descriptor to verify.
 */
export async function verifyMigrationLifecycle(
  executor: SqlExecutor,
  migration: MigrationDescriptor,
): Promise<void> {
  if (!migration.rollbackSql) {
    throw new Error(`Verification requires a rollback script for migration "${migration.name}".`);
  }

  await executeSqlScript(executor, migration.forwardSql);
  if (migration.validateSql) {
    await executeSqlScript(executor, migration.validateSql);
  }

  await executeSqlScript(executor, migration.rollbackSql);

  await executeSqlScript(executor, migration.forwardSql);
  if (migration.validateSql) {
    await executeSqlScript(executor, migration.validateSql);
  }
}

export interface MigrationRunner {
  up(): Promise<MigrationResult>;
  down(): Promise<RollbackResult>;
  status(): Promise<MigrationLedgerRecord[]>;
}

/**
 * Factory creating a migration runner bound to a SQL executor.
 *
 * @param executor Database query executor.
 * @param options Runner options including custom migrations directory.
 */
export function createMigrationRunner(
  executor: SqlExecutor,
  options?: { migrationsDir?: string }
): MigrationRunner {
  return {
    up: () => applyMigrations(executor, options),
    down: () => rollbackLastMigration(executor, options),
    status: async () => {
      await ensureMigrationLedgerTable(executor);
      return getAppliedMigrations(executor);
    },
  };
}
