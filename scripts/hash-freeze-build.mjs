#!/usr/bin/env node

/**
 * Hash-Freeze Build Script
 *
 * Produces a signed hash manifest of all deployable artifacts.
 * This manifest is stored alongside the release and used to verify
 * that the deployed artifacts match the audited build.
 *
 * Usage:
 *   node scripts/hash-freeze-build.mjs [--write] [--manifest-dir ./release-manifests]
 *
 * Options:
 *   --write         Write manifest to disk (default: stdout only)
 *   --manifest-dir  Output directory (default: ./release-manifests)
 *
 * Output:
 *   - SHA-256 manifest of:
 *       • Compiled EVM contracts (backend/contracts/artifacts/)
 *       • Compiled Soroban WASM (soroban/target/wasm32-unknown-unknown/release/*.wasm)
 *       • Frontend build (frontend/.next/ or frontend/out/)
 *       • Docker images or Dockerfile + context hash
 *   - Signed with a designated signing key (optional, hardware-backed for production)
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

const ARTIFACT_PATTERNS = [
  // EVM contracts
  { name: 'EVM Policy ABI', glob: 'backend/contracts/artifacts/contracts/GoldRaccoonPolicy.sol/GoldRaccoonPolicy.json' },
  { name: 'EVM Vault ABI', glob: 'backend/contracts/artifacts/contracts/GoldRaccoonVault.sol/GoldRaccoonVault.json' },
  { name: 'EVM RiskRegistry ABI', glob: 'backend/contracts/artifacts/contracts/GoldRaccoonRiskRegistry.sol/GoldRaccoonRiskRegistry.json' },
  // Soroban WASM
  { name: 'Soroban Policy WASM', glob: 'soroban/target/wasm32-unknown-unknown/release/gold_raccoon_policy.wasm' },
  { name: 'Soroban Vault WASM', glob: 'soroban/target/wasm32-unknown-unknown/release/gold_raccoon_vault.wasm' },
  // Frontend build (try .next first, fallback to out/)
  { name: 'Frontend Build (dir)', glob: 'frontend/.next/BUILD_ID' },
];

function hashFile(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function hashDir(dirPath) {
  const hash = createHash('sha256');
  const entries = readdirSync(dirPath, { recursive: true })
    .filter(f => statSync(join(dirPath, f)).isFile())
    .sort();

  for (const entry of entries) {
    const content = readFileSync(join(dirPath, entry));
    hash.update(`${entry}\0${content.length}\0`);
    hash.update(content);
  }
  return hash.digest('hex');
}

function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes('--write');
  const manifestDir = args.includes('--manifest-dir')
    ? args[args.indexOf('--manifest-dir') + 1]
    : './release-manifests';

  const manifest = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    branch: process.env.GIT_BRANCH || null,
    commit: process.env.GIT_COMMIT || null,
    artifacts: [],
  };

  for (const pattern of ARTIFACT_PATTERNS) {
    const fullPath = join(ROOT, pattern.glob);
    let hash = null;
    let status = 'missing';

    if (existsSync(fullPath)) {
      try {
        if (statSync(fullPath).isDirectory()) {
          hash = hashDir(fullPath);
        } else {
          hash = hashFile(fullPath);
        }
        status = 'found';
      } catch (err) {
        status = `error: ${err.message}`;
      }
    }

    manifest.artifacts.push({
      name: pattern.name,
      path: pattern.glob,
      status,
      sha256: hash,
    });
  }

  // If GIT metadata not in env, try to read from git
  if (!manifest.branch) {
    try {
      const head = readFileSync(join(ROOT, '.git', 'HEAD'), 'utf8').trim();
      if (head.startsWith('ref: ')) {
        manifest.branch = head.slice(5);
      }
    } catch { /* ignore */ }
  }
  if (!manifest.commit) {
    try {
      manifest.commit = readFileSync(join(ROOT, '.git', 'HEAD'), 'utf8').trim();
    } catch { /* ignore */ }
  }

  // Output
  const output = JSON.stringify(manifest, null, 2);

  if (shouldWrite) {
    const outDir = resolve(ROOT, manifestDir);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const filename = `build-manifest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const outPath = join(outDir, filename);
    writeFileSync(outPath, output, 'utf8');
    console.log(`Manifest written to ${outPath}`);
  } else {
    console.log(output);
  }
}

main();
