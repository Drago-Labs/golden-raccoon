#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    file: { type: 'string' },
    manifest: { type: 'string' },
  },
});

const dbUrl = values.url || process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Database URL is required (--url or VERIFY_DATABASE_URL).');
  process.exit(1);
}
if (!values.file) {
  console.error('Backup file is required (--file).');
  process.exit(1);
}

const manifestPath = values.manifest || `${values.file}.manifest.json`;
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const fileData = await readFile(values.file);
const actualChecksum = createHash('sha256').update(fileData).digest('hex');
if (actualChecksum !== manifest.checksum) {
  console.error(`Checksum mismatch: expected ${manifest.checksum}, got ${actualChecksum}`);
  process.exit(1);
}
console.log('Checksum OK');

for (const table of manifest.tables) {
  const expected = manifest.rowCounts[table];
  const res = spawnSync('psql', [dbUrl, '-t', '-A', '-c', `SELECT COUNT(*) FROM "${table}"`], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(res.stderr);
    process.exit(1);
  }
  const actual = parseInt(res.stdout.trim(), 10);
  if (actual !== expected) {
    console.error(`Row count mismatch for ${table}: expected ${expected}, got ${actual}`);
    process.exit(1);
  }
  console.log(`Table ${table}: ${actual} rows`);
}

const fkQuery = `SELECT tc.constraint_name, tc.table_name, kcu.column_name, ccu.table_name, ccu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name WHERE tc.constraint_type = 'FOREIGN KEY'`;
const fkRes = spawnSync('psql', [dbUrl, '-t', '-A', '-F', '|', '-c', fkQuery], { encoding: 'utf8' });
if (fkRes.status !== 0) {
  console.error(fkRes.stderr);
  process.exit(1);
}
const lines = fkRes.stdout.trim().split('\n').filter(line => line.length > 0);
for (const line of lines) {
  const [constraint, childTable, childCol, parentTable, parentCol] = line.split('|');
  const orphanCheck = `SELECT COUNT(*) FROM "${childTable}" c LEFT JOIN "${parentTable}" p ON c."${childCol}" = p."${parentCol}" WHERE c."${childCol}" IS NOT NULL AND p."${parentCol}" IS NULL`;
  const res = spawnSync('psql', [dbUrl, '-t', '-A', '-c', orphanCheck], { encoding: 'utf8' });
  const violations = parseInt(res.stdout.trim(), 10);
  if (violations > 0) {
    console.error(`Foreign key ${constraint} violated: ${violations} orphan row(s) in ${childTable}.`);
    process.exit(1);
  }
}
console.log('Referential integrity OK');
console.log('Verification passed.');
