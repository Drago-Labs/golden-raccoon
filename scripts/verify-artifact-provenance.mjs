#!/usr/bin/env node

/**
 * Offline Artifact Provenance Verifier
 *
 * Verifies that compiled EVM and Soroban contract artifacts match
 * the canonical hash-freeze build manifest.
 * Recomputes SHA-256 hashes of source files, config files, and compiled artifacts
 * to detect any tampering or divergence.
 *
 * Usage:
 *   node scripts/verify-artifact-provenance.mjs [manifest-path]
 *   node scripts/verify-artifact-provenance.mjs --strict
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

export function hashFile(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export function hashDir(dirPath) {
  if (!existsSync(dirPath)) {
    return null;
  }
  const hash = createHash('sha256');
  const entries = readdirSync(dirPath, { recursive: true })
    .filter((f) => statSync(join(dirPath, f)).isFile())
    .sort();

  for (const entry of entries) {
    const content = readFileSync(join(dirPath, entry));
    hash.update(`${entry}\0${content.length}\0`);
    hash.update(content);
  }
  return hash.digest('hex');
}

export function verifyProvenanceManifest(manifestPath, options = {}) {
  const strict = options.strict ?? false;
  const targetPath = resolve(ROOT, manifestPath);

  if (!existsSync(targetPath)) {
    return {
      valid: false,
      reason: `Manifest not found at ${targetPath}`,
      details: [],
    };
  }

  let manifest;
  try {
    const content = readFileSync(targetPath, 'utf8');
    manifest = JSON.parse(content);
  } catch (err) {
    return {
      valid: false,
      reason: `Invalid JSON manifest: ${err.message}`,
      details: [],
    };
  }

  if (!manifest.version || !manifest.timestamp || !Array.isArray(manifest.artifacts)) {
    return {
      valid: false,
      reason: 'Manifest schema invalid: missing version, timestamp, or artifacts list',
      details: [],
    };
  }

  if (strict && manifest.isDirty) {
    return {
      valid: false,
      reason: 'Manifest rejected: build was produced from a dirty working tree',
      details: [],
    };
  }

  const results = [];
  let allMatched = true;

  for (const item of manifest.artifacts) {
    const fullPath = join(ROOT, item.path);
    let computedHash = null;

    if (existsSync(fullPath)) {
      if (statSync(fullPath).isDirectory()) {
        computedHash = hashDir(fullPath);
      } else {
        computedHash = hashFile(fullPath);
      }
    }

    if (item.sha256 !== null) {
      const matches = computedHash !== null && computedHash === item.sha256;
      if (!matches) {
        allMatched = false;
      }
      results.push({
        name: item.name,
        path: item.path,
        expected: item.sha256,
        actual: computedHash,
        matches,
      });
    }
  }

  if (Array.isArray(manifest.inputs)) {
    for (const input of manifest.inputs) {
      const fullPath = join(ROOT, input.path);
      const computedHash = hashFile(fullPath);
      if (input.sha256 !== null) {
        const matches = computedHash !== null && computedHash === input.sha256;
        if (!matches) {
          allMatched = false;
        }
        results.push({
          name: `Input: ${input.name || input.path}`,
          path: input.path,
          expected: input.sha256,
          actual: computedHash,
          matches,
        });
      }
    }
  }

  return {
    valid: allMatched,
    manifestMeta: {
      version: manifest.version,
      timestamp: manifest.timestamp,
      commit: manifest.commit,
      isDirty: manifest.isDirty ?? false,
      compiler: manifest.compiler,
    },
    details: results,
  };
}

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const pathArg = args.find((a) => !a.startsWith('--'));

  let manifestPath = pathArg;
  if (!manifestPath) {
    const dir = resolve(ROOT, 'release-manifests');
    if (existsSync(dir)) {
      const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse();
      if (files.length > 0) {
        manifestPath = join('release-manifests', files[0]);
      }
    }
  }

  if (!manifestPath) {
    console.error('ERROR: No manifest path provided and no manifests found in ./release-manifests');
    process.exit(1);
  }

  console.log(`Verifying provenance manifest: ${manifestPath}`);
  const result = verifyProvenanceManifest(manifestPath, { strict });

  console.log('\n--- Verification Results ---');
  for (const item of result.details) {
    const status = item.matches ? '✅ OK' : '❌ MISMATCH';
    console.log(`[${status}] ${item.name} (${item.path})`);
    if (!item.matches) {
      console.log(`   Expected: ${item.expected}`);
      console.log(`   Actual:   ${item.actual}`);
    }
  }

  if (!result.valid) {
    console.error(`\n❌ VERIFICATION FAILED: ${result.reason || 'Artifact checksum mismatches detected.'}`);
    process.exit(1);
  }

  console.log('\n✅ VERIFICATION PASSED: All artifact and input hashes match provenance manifest.');
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main();
}
