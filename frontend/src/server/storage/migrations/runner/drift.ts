import fs from "node:fs";
import path from "node:path";
import { applyMigrations } from "./runner";

export interface ColumnSchemaInfo {
  tableName: string;
  columnName: string;
  dataType: string;
  isNullable: string;
}

export interface TableConstraintInfo {
  tableName: string;
  constraintName: string;
  constraintType: string;
}

export interface SchemaSnapshot {
  columns: Map<string, ColumnSchemaInfo>;
  constraints: Map<string, TableConstraintInfo>;
  tables: Set<string>;
}

export interface SchemaDriftReport {
  hasDrift: boolean;
  differences: string[];
  dumpTableCount: number;
  migrationTableCount: number;
}

export class SchemaDriftError extends Error {
  readonly differences: string[];

  /**
   * Constructs a schema drift error with details of all structural divergences.
   *
   * @param differences List of identified schema differences.
   */
  constructor(differences: string[]) {
    super(
      `Schema drift detected between schema.sql dump and cumulative migrations:\n` +
      differences.map((diff) => `  - ${diff}`).join("\n"),
    );
    this.name = "SchemaDriftError";
    this.differences = differences;
  }
}

/**
 * Extracts schema metadata from a database instance.
 *
 * @param db PGlite or SQL query interface.
 * @returns Structured snapshot of public schema tables, columns, and constraints.
 */
async function inspectDatabaseSchema(db: {
  query<T = Record<string, unknown>>(sql: string): Promise<{ rows: T[] }>;
}): Promise<SchemaSnapshot> {
  const columnQuery = `
    select table_name, column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, column_name;
  `;
  const columnsRes = await db.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>(columnQuery);

  const constraintQuery = `
    select table_name, constraint_name, constraint_type
    from information_schema.table_constraints
    where table_schema = 'public'
    order by table_name, constraint_name;
  `;
  const constraintsRes = await db.query<{
    table_name: string;
    constraint_name: string;
    constraint_type: string;
  }>(constraintQuery);

  const columns = new Map<string, ColumnSchemaInfo>();
  const tables = new Set<string>();
  for (const row of columnsRes.rows) {
    tables.add(row.table_name);
    const key = `${row.table_name}.${row.column_name}`;
    columns.set(key, {
      tableName: row.table_name,
      columnName: row.column_name,
      dataType: row.data_type,
      isNullable: row.is_nullable,
    });
  }

  const constraints = new Map<string, TableConstraintInfo>();
  for (const row of constraintsRes.rows) {
    const key = `${row.table_name}.${row.constraint_name}`;
    constraints.set(key, {
      tableName: row.table_name,
      constraintName: row.constraint_name,
      constraintType: row.constraint_type,
    });
  }

  return { columns, constraints, tables };
}

/**
 * Compares the schema generated from schema.sql against the cumulative schema generated
 * by applying all migrations in order.
 *
 * @param options Paths to schema.sql and migrations directory.
 * @returns Detailed drift report.
 */
export async function detectSchemaDrift(options?: {
  schemaPath?: string;
  migrationsDir?: string;
}): Promise<SchemaDriftReport> {
  const schemaFile = options?.schemaPath ?? path.join(process.cwd(), "src/server/storage/schema.sql");
  const migrationsDirectory = options?.migrationsDir ?? path.join(process.cwd(), "src/server/storage/migrations");

  const { PGlite } = await import("@electric-sql/pglite");

  const dbDump = new PGlite();
  let dumpSql = fs.readFileSync(schemaFile, "utf8");
  dumpSql = dumpSql
    .replace(/create extension [^;]+;/gi, "-- skipped extension")
    .replace(/coalesce\(asset,\s*E'\\0'\)/g, "coalesce(asset, '')")
    .replace(/coalesce\(consumer,\s*E'\\0'\)/g, "coalesce(consumer, '')");

  await dbDump.exec(dumpSql);
  const dumpSnapshot = await inspectDatabaseSchema(dbDump);

  const dbMigrations = new PGlite();
  await applyMigrations(dbMigrations, { migrationsDir: migrationsDirectory });
  const migrationSnapshot = await inspectDatabaseSchema(dbMigrations);

  const differences: string[] = [];

  for (const table of dumpSnapshot.tables) {
    if (!migrationSnapshot.tables.has(table)) {
      differences.push(`Table "${table}" exists in schema.sql dump but missing in cumulative migrations`);
    }
  }

  for (const table of migrationSnapshot.tables) {
    if (!dumpSnapshot.tables.has(table)) {
      differences.push(`Table "${table}" exists in migrations but missing in schema.sql dump`);
    }
  }

  for (const [key, dumpCol] of dumpSnapshot.columns.entries()) {
    const migCol = migrationSnapshot.columns.get(key);
    if (!migCol) {
      differences.push(
        `Column "${key}" exists in schema.sql dump (${dumpCol.dataType}) but is missing in migrations`,
      );
    } else {
      if (dumpCol.dataType !== migCol.dataType) {
        differences.push(
          `Column "${key}" type divergence: schema.sql has "${dumpCol.dataType}", migrations has "${migCol.dataType}"`,
        );
      }
      if (dumpCol.isNullable !== migCol.isNullable) {
        differences.push(
          `Column "${key}" nullability divergence: schema.sql has isNullable="${dumpCol.isNullable}", migrations has isNullable="${migCol.isNullable}"`,
        );
      }
    }
  }

  for (const [key, migCol] of migrationSnapshot.columns.entries()) {
    if (!dumpSnapshot.columns.has(key)) {
      differences.push(
        `Column "${key}" exists in migrations (${migCol.dataType}) but is missing in schema.sql dump`,
      );
    }
  }

  return {
    hasDrift: differences.length > 0,
    differences,
    dumpTableCount: dumpSnapshot.tables.size,
    migrationTableCount: migrationSnapshot.tables.size,
  };
}

/**
 * Asserts that no schema drift exists. Throws SchemaDriftError if any differences are detected.
 *
 * @param options Configuration options.
 */
export async function assertNoSchemaDrift(options?: {
  schemaPath?: string;
  migrationsDir?: string;
}): Promise<SchemaDriftReport> {
  const report = await detectSchemaDrift(options);
  if (report.hasDrift) {
    throw new SchemaDriftError(report.differences);
  }
  return report;
}
