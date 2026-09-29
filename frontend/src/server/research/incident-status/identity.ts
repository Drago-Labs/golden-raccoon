/**
 * Chain-aware subject identity.
 *
 * Display names are never enough: two protocols called "Bridge" on different
 * networks, or the same symbol with different issuers, must remain distinct.
 */
import type { SubjectIdentity, SubjectInput } from "./schema";

export function identityKeyFor(subject: SubjectInput): string {
  const parts = [
    subject.chainId.trim().toLowerCase(),
    subject.protocolId.trim().toLowerCase(),
    (subject.contractAddress ?? "").trim().toLowerCase(),
    (subject.issuer ?? "").trim().toLowerCase(),
  ];

  return parts.join("|");
}

export function buildSubject(subject: SubjectInput): SubjectIdentity {
  return {
    chainId: subject.chainId.trim(),
    protocolId: subject.protocolId.trim(),
    displayName: subject.displayName.trim(),
    contractAddress: subject.contractAddress?.trim() || null,
    issuer: subject.issuer?.trim() || null,
    identityKey: identityKeyFor(subject),
  };
}

export function subjectsMatch(left: SubjectInput, right: SubjectInput): boolean {
  return identityKeyFor(left) === identityKeyFor(right);
}
