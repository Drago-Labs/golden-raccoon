import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { EvidenceArtifact, GateVerdict } from "./types";

export function computeVerdictDigest(verdict: GateVerdict): string {
  const canonical = {
    verdict: verdict.verdict,
    commitSha: verdict.commitSha,
    environment: verdict.environment,
    summary: verdict.summary,
    gates: verdict.gates.map((g) => ({
      id: g.id,
      name: g.name,
      severity: g.severity,
      status: g.status,
      failureReason: g.failureReason,
    })),
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

export function generateEvidenceArtifact(verdict: GateVerdict): EvidenceArtifact {
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

export function verifyEvidenceArtifact(
  filePath: string,
  expectedCommitSha?: string
): { valid: boolean; reason?: string; artifact?: EvidenceArtifact } {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const artifact: EvidenceArtifact = JSON.parse(raw);

    if (!artifact.schemaVersion || !artifact.commitSha || !artifact.verdict || !artifact.digest) {
      return { valid: false, reason: "Evidence artifact schema is invalid or incomplete" };
    }

    if (expectedCommitSha && artifact.commitSha !== expectedCommitSha) {
      return {
        valid: false,
        reason: `Evidence commit mismatch: artifact has '${artifact.commitSha}', expected '${expectedCommitSha}'`,
        artifact,
      };
    }

    const recomputed = computeVerdictDigest(artifact.verdict);
    if (recomputed !== artifact.digest) {
      return {
        valid: false,
        reason: `Evidence digest mismatch: recorded '${artifact.digest}', recomputed '${recomputed}' (evidence was tampered with or edited)`,
        artifact,
      };
    }

    return { valid: true, artifact };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, reason: `Failed to read evidence artifact: ${msg}` };
  }
}
