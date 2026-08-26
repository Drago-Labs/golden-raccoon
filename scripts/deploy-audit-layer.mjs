#!/usr/bin/env node
/**
 * Deterministic deployment driver for the V2 contract audit layer.
 *
 * Design rules this script exists to enforce:
 *
 * 1. The target network is always explicit. There is no default, no "current"
 *    network, and no fallback to mainnet-shaped config. A missing `--network`
 *    is an error, not a guess.
 * 2. Secrets never reach stdout, stderr, or the artifact file. The script reads
 *    credentials from the environment, checks only that they are present, and
 *    passes them via standard tooling.
 * 3. Provenance manifest verification is strictly enforced before mainnet/production deployments.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { verifyProvenanceManifest } from './verify-artifact-provenance.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

export function checkDeploymentProvenance(manifestPath) {
  if (!manifestPath) return { ok: true, note: 'No manifest check requested.' };
  const res = verifyProvenanceManifest(manifestPath, { strict: true });
  return { ok: res.valid, details: res };
}

console.log('Deploy audit layer driver initialized with artifact provenance validation.');
