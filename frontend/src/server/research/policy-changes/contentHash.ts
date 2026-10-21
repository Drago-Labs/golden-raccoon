import { createHash } from "node:crypto";

/** SHA-256 of the normalized extracted text — unchanged text hashes identically. */
export function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function snapshotIdFor(projectId: string, fetchedAt: string, contentHash: string): string {
  return createHash("sha256").update(`${projectId}|${fetchedAt}|${contentHash}`).digest("hex").slice(0, 24);
}
