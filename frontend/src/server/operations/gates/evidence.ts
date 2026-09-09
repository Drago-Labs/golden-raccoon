import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { EvidenceArtifact, VerdictReport } from "./types";

/**
 * Deterministically sorts object keys and converts value to a canonical JSON string.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const serializedElements = value.map((item) => canonicalizeJson(item));
    return `[${serializedElements.join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b)
  );

  const serializedProps = entries.map(
    ([k, v]) => `${JSON.stringify(k)}:${canonicalizeJson(v)}`
  );

  return `{${serializedProps.join(",")}}`;
}

/**
 * Computes a deterministic SHA-256 digest of a verdict report.
 */
export function computeVerdictDigest(verdict: VerdictReport): string {
  const canonical = canonicalizeJson(verdict);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Generates a signed evidence artifact from a verdict report.
 */
export function generateEvidence(verdict: VerdictReport): EvidenceArtifact {
  const digest = computeVerdictDigest(verdict);
  return {
    schemaVersion: "1.0.0",
    commitSha: verdict.commitSha,
    environment: verdict.environment,
    generatedAt: new Date().toISOString(),
    verdict,
    digest,
  };
}

/**
 * Verifies that an evidence artifact is authentic, matches the target commit, and records a ready verdict.
 */
export function verifyEvidence(
  evidence: EvidenceArtifact,
  expectedCommit: string
): { valid: boolean; reason?: string } {
  if (!evidence || typeof evidence !== "object") {
    return { valid: false, reason: "Evidence payload is malformed or empty" };
  }

  if (evidence.schemaVersion !== "1.0.0") {
    return {
      valid: false,
      reason: `Unsupported evidence schema version: ${evidence.schemaVersion}`,
    };
  }

  if (evidence.commitSha !== expectedCommit) {
    return {
      valid: false,
      reason: `Stale evidence: commit mismatch (recorded ${evidence.commitSha}, expected ${expectedCommit})`,
    };
  }

  const computedDigest = computeVerdictDigest(evidence.verdict);
  if (computedDigest !== evidence.digest) {
    return {
      valid: false,
      reason: `Tampered evidence: digest mismatch (recorded ${evidence.digest}, computed ${computedDigest})`,
    };
  }

  if (evidence.verdict.verdict !== "ready") {
    return {
      valid: false,
      reason: `Evidence records blocked release: ${evidence.verdict.reasons.join("; ")}`,
    };
  }

  return { valid: true };
}

/**
 * Reads and parses an evidence artifact from the filesystem.
 */
export function readEvidence(filePath: string): EvidenceArtifact {
  const content = readFileSync(filePath, "utf8");
  return JSON.parse(content) as EvidenceArtifact;
}

/**
 * Writes an evidence artifact to the specified path with formatted JSON.
 */
export function writeEvidence(
  filePath: string,
  evidence: EvidenceArtifact
): void {
  const content = JSON.stringify(evidence, null, 2);
  writeFileSync(filePath, `${content}\n`, "utf8");
}
