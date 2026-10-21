import type { QuorumState } from "./errors";

export function sourceAgeSeconds(fetchedAt: string | null, now: Date): number | null {
  if (!fetchedAt) return null;
  const parsed = Date.parse(fetchedAt);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.floor((now.getTime() - parsed) / 1000));
}

export function coverageNotice(state: QuorumState, staleSources: number): string {
  const safety = "This is dependency evidence. It does not prove quorum intersection or network safety.";
  if (state === "unavailable") return `The validator source was unavailable. No organizations were invented. ${safety}`;
  if (state === "partial") return `${staleSources} source(s) are stale or incomplete. ${safety}`;
  return safety;
}
