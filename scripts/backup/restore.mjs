#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    file: { type: 'string' },
    allowProduction: { type: 'boolean', default: false },
  },
});

const targetUrl = values.url || process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;
if (!targetUrl) {
  console.error('Target database URL is required (--url or TARGET_DATABASE_URL).');
  process.exit(1);
}
if (!values.file) {
  console.error('Backup file is required (--file).');
  process.exit(1);
}

if (!values.allowProduction && /prod/i.test(targetUrl)) {
  console.error('Refusing to restore to a production-like database. Pass --allowProduction to confirm.');
  process.exit(1);
}

const manifestPath = `${values.file}.manifest.json`;
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const actualChecksum = createHash('sha256').update(await readFile(values.file)).digest('hex');
if (actualChecksum !== manifest.checksum) {
  console.error(`Checksum mismatch: expected ${manifest.checksum}, got ${actualChecksum}`);
  process.exit(1);
}

const temp = await mkdtemp(path.join(tmpdir(), 'restore-'));
try {
  let res = spawnSync('tar', ['-xzf', values.file, '-C', temp], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(res.stderr);
    process.exit(1);
  }

  res = spawnSync('psql', [targetUrl, '-f', path.join(temp, 'schema.sql')], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(res.stderr);
    process.exit(1);
  }

  res = spawnSync('psql', [targetUrl, '-c', 'SET session_replication_role = replica'], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(res.stderr);
    process.exit(1);
  }

  for (const table of manifest.tables) {
    const csvFile = path.join(temp, `data-${table}.csv`);
    res = spawnSync('psql', [targetUrl, '-c', `\copy "${table}" FROM '${csvFile}' WITH CSV HEADER`], { encoding: 'utf8' });
    if (res.status !== 0) {
      console.error(res.stderr);
      process.exit(1);
    }
  }

  res = spawnSync('psql', [targetUrl, '-c', 'SET session_replication_role = DEFAULT'], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(res.stderr);
    process.exit(1);
  }

  console.log('Restore completed successfully.');
} finally {
  await rm(temp, { recursive: true, force: true });
}
