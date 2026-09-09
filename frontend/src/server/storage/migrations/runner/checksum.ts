import { createHash } from "node:crypto";

/**
 * Normalizes SQL text by converting line endings to LF, removing trailing whitespace per line,
 * and trimming leading/trailing blank lines.
 *
 * @param sql Raw SQL text.
 * @returns Normalized SQL string.
 */
export function normalizeSql(sql: string): string {
  return sql
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/**
 * Computes a deterministic SHA-256 checksum for migration SQL text.
 *
 * @param sql Migration SQL content.
 * @returns Hex-encoded SHA-256 checksum.
 */
export function computeMigrationChecksum(sql: string): string {
  const normalized = normalizeSql(sql);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Verifies that a migration SQL content matches an expected checksum.
 *
 * @param sql Migration SQL content.
 * @param expectedChecksum Recorded checksum from migration ledger.
 * @returns True when checksums match.
 */
export function verifyMigrationChecksum(sql: string, expectedChecksum: string): boolean {
  return computeMigrationChecksum(sql) === expectedChecksum;
}
