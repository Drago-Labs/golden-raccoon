export {
  computeMigrationChecksum,
  verifyMigrationChecksum,
  normalizeSql,
} from "./checksum";

export {
  ensureMigrationLedgerTable,
  getAppliedMigrations,
  recordMigrationInLedger,
  removeMigrationFromLedger,
  type SqlExecutor,
  type MigrationLedgerRecord,
} from "./ledger";

export {
  applyMigrations,
  rollbackLastMigration,
  verifyMigrationLifecycle,
  executeSqlScript,
  splitSqlStatements,
  loadMigrationDescriptors,
  MigrationChecksumMismatchError,
  type MigrationDescriptor,
  type MigrationResult,
  type RollbackResult,
  type MigrationRunner,
  createMigrationRunner,
} from "./runner";

export {
  detectSchemaDrift,
  assertNoSchemaDrift,
  SchemaDriftError,
  type SchemaDriftReport,
  type ColumnSchemaInfo,
  type TableConstraintInfo,
} from "./drift";
