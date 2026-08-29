#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const policy = JSON.parse(await readFile(path.join(__dirname, 'policy.json'), 'utf8'));

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    output: { type: 'string', default: path.join(__dirname, '..', '..', 'backups') },
  },
});

const url = values.url || process.env.DATABASE_URL;
if (!url) {
  console.error('Database URL is required (--url or DATABASE_URL).');
  process.exit(1);
}

await mkdir(values.output, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const base = `backup-${timestamp}`;
const tarPath = path.join(values.output, `${base}.tar.gz`);
const checksumPath = `${tarPath}.sha256`;

const tempDir = await mkdtemp(path.join(tmpdir(), 'backup-'));
try {
  // Dump schema
  const schemaFile = path.join(tempDir, 'schema.sql');
  let res = spawnSync('pg_dump', ['--schema-only', '--no-owner', '--no-privileges', '-d', url, '-f', schemaFile], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(res.stderr);
    process.exit(1);
  }

  // Dump data with redaction
  const rowCounts = {};
  for (const table of policy.tables) {
    const sensitive = new Set(policy.sensitive_columns?.[table] || []);
    const colsRes = spawnSync('psql', [url, '-t', '-A', '-c', `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' ORDER BY ordinal_position`], { encoding: 'utf8' });
    if (colsRes.status !== 0) {
      console.error(colsRes.stderr);
      process.exit(1);
    }
    const allCols = colsRes.stdout.trim().split('\n');
    const selectCols = allCols.map(c => sensitive.has(c) ? `'REDACTED' AS "${c}"` : `"${c}"`).join(', ');
    const dataFile = path.join(tempDir, `data-${table}.csv`);
    res = spawnSync('psql', [url, '-c', `\copy (SELECT ${selectCols} FROM "${table}") TO '${dataFile}' WITH CSV HEADER`], { encoding: 'utf8' });
    if (res.status !== 0) {
      console.error(res.stderr);
      process.exit(1);
    }
    const countRes = spawnSync('psql', [url, '-t', '-A', '-c', `SELECT COUNT(*) FROM "${table}"`], { encoding: 'utf8' });
    if (countRes.status !== 0) {
      console.error(countRes.stderr);
      process.exit(1);
    }
    rowCounts[table] = parseInt(countRes.stdout.trim(), 10);
  }

  // Create archive
  res = spawnSync('tar', ['-czf', tarPath, '-C', tempDir, '.'], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(res.stderr);
    process.exit(1);
  }

  // Compute checksum
  const data = await readFile(tarPath);
  const checksum = createHash('sha256').update(data).digest('hex');
  await writeFile(checksumPath, checksum + '\n');

  // Write manifest
  const manifest = {
    createdAt: new Date().toISOString(),
    tables: policy.tables,
    sensitiveColumns: policy.sensitive_columns,
    rowCounts,
    checksum,
    retention: policy.retention,
  };
  await writeFile(`${tarPath}.manifest.json`, JSON.stringify(manifest, null, 2));

  console.log(`Backup created: ${tarPath}`);
  console.log(`Checksum: ${checksum}`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
