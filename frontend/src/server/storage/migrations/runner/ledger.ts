/**
 * Migration ledger database operations.
 */

export interface SqlExecutor {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number }>;
  exec?(text: string): Promise<unknown>;
}

export interface MigrationLedgerRecord {
  name: string;
  checksum: string;
  appliedAt: string;
  executionTimeMs: number;
}

/**
 * Ensures the migration_ledger table exists in the target database.
 *
 * @param executor SQL execution interface.
 */
export async function ensureMigrationLedgerTable(executor: SqlExecutor): Promise<void> {
  const ddl = `
    create table if not exists migration_ledger (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now(),
      execution_time_ms integer not null default 0
    );
  `;
  if (typeof executor.exec === "function") {
    await executor.exec(ddl);
  } else {
    await executor.query(ddl);
  }
}

/**
 * Retrieves all applied migrations from the ledger ordered by applied_at asc.
 *
 * @param executor SQL execution interface.
 * @returns Array of migration records.
 */
export async function getAppliedMigrations(
  executor: SqlExecutor,
): Promise<MigrationLedgerRecord[]> {
  await ensureMigrationLedgerTable(executor);
  const result = await executor.query<{
    name: string;
    checksum: string;
    applied_at: string | Date;
    execution_time_ms: number;
  }>("select name, checksum, applied_at, execution_time_ms from migration_ledger order by name asc");

  return result.rows.map((row) => ({
    name: row.name,
    checksum: row.checksum,
    appliedAt: typeof row.applied_at === "string" ? row.applied_at : new Date(row.applied_at).toISOString(),
    executionTimeMs: Number(row.execution_time_ms ?? 0),
  }));
}

/**
 * Records an applied migration in the ledger.
 *
 * @param executor SQL execution interface.
 * @param record Migration record to store.
 */
export async function recordMigrationInLedger(
  executor: SqlExecutor,
  record: Omit<MigrationLedgerRecord, "appliedAt">,
): Promise<void> {
  await ensureMigrationLedgerTable(executor);
  await executor.query(
    `insert into migration_ledger (name, checksum, applied_at, execution_time_ms)
     values ($1, $2, now(), $3)
     on conflict (name) do update
     set checksum = excluded.checksum,
         applied_at = excluded.applied_at,
         execution_time_ms = excluded.execution_time_ms`,
    [record.name, record.checksum, record.executionTimeMs],
  );
}

/**
 * Removes a migration record from the ledger when rolled back.
 *
 * @param executor SQL execution interface.
 * @param name Name of the migration to remove.
 */
export async function removeMigrationFromLedger(
  executor: SqlExecutor,
  name: string,
): Promise<void> {
  await ensureMigrationLedgerTable(executor);
  await executor.query("delete from migration_ledger where name = $1", [name]);
}
