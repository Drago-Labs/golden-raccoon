/**
 * Subject identity keys.
 *
 * Same-symbol tokens on different chains or issuers must never collapse. The
 * identity key is built only from caller-declared fields — nothing is inferred
 * from a ticker appearing in a URL or display name.
 */
import type { ContinuitySubject, SubjectInput } from "./schema";

export function buildIdentityKey(input: SubjectInput): string {
  const issuer = (input.issuer ?? "").trim().toLowerCase();
  const contract = (input.contractAddress ?? "").trim().toLowerCase();
  return [
    input.chainId.trim().toLowerCase(),
    input.symbol.trim().toUpperCase(),
    issuer,
    contract,
  ].join("|");
}

export function adaptSubject(input: SubjectInput): ContinuitySubject {
  return {
    subjectId: input.subjectId,
    identityKey: buildIdentityKey(input),
    chainId: input.chainId.trim(),
    symbol: input.symbol.trim(),
    issuer: input.issuer?.trim() ? input.issuer.trim() : null,
    contractAddress: input.contractAddress?.trim() ? input.contractAddress.trim() : null,
  };
}
