/**
 * Separate copied reports from independent advisories.
 *
 * Same canonical URL, declared syndication, or near-duplicate text from the
 * same outlet family does not add independent support for a status transition.
 */
import { textSimilarity } from "./canonical";
import { INCIDENT_LIMITS, type DocumentRef, type ProvenanceRole } from "./schema";

function assignRole(
  document: DocumentRef,
  matchedAgainst: DocumentRef | null,
  role: ProvenanceRole,
  reason: string,
): DocumentRef {
  return {
    ...document,
    role,
    roleReason: matchedAgainst
      ? `${reason} Matched against ${matchedAgainst.documentId}.`
      : reason,
  };
}

export function assignProvenance(documents: DocumentRef[]): DocumentRef[] {
  const byUrl = new Map<string, DocumentRef>();
  const result: DocumentRef[] = [];

  for (const document of documents) {
    if (document.canonicalUrl) {
      const existing = byUrl.get(document.canonicalUrl);
      if (existing) {
        result.push(
          assignRole(
            document,
            existing,
            "syndicated_copy",
            "Same canonical URL as an earlier document; this is a copy, not an independent advisory.",
          ),
        );
        continue;
      }
      byUrl.set(document.canonicalUrl, document);
    }

    if (document.syndicatedFrom) {
      const source = documents.find(
        (candidate) =>
          candidate.documentId !== document.documentId &&
          (candidate.domain === document.syndicatedFrom || candidate.outletId === document.syndicatedFrom),
      );
      if (source) {
        result.push(
          assignRole(
            document,
            source,
            "syndicated_copy",
            "Document declares syndication from another outlet.",
          ),
        );
        continue;
      }
    }

    const sameOutlet = result.find(
      (candidate) =>
        candidate.role === "independent" &&
        candidate.outletId === document.outletId &&
        textSimilarity(`${candidate.title} ${candidate.summary ?? ""}`, `${document.title} ${document.summary ?? ""}`) >=
          INCIDENT_LIMITS.nearDuplicateSimilarity &&
        Math.min(candidate.tokenCount, document.tokenCount) >= INCIDENT_LIMITS.minTokensForSimilarity,
    );

    if (sameOutlet) {
      result.push(
        assignRole(
          document,
          sameOutlet,
          "same_outlet_repeat",
          "Near-duplicate text from the same outlet; repeating one outlet is not independent corroboration.",
        ),
      );
      continue;
    }

    const nearDupOther = result.find(
      (candidate) =>
        candidate.role === "independent" &&
        candidate.outletId !== document.outletId &&
        textSimilarity(`${candidate.title} ${candidate.summary ?? ""}`, `${document.title} ${document.summary ?? ""}`) >=
          INCIDENT_LIMITS.nearDuplicateSimilarity &&
        Math.min(candidate.tokenCount, document.tokenCount) >= INCIDENT_LIMITS.minTokensForSimilarity &&
        !document.canonicalUrl,
    );

    // Near-duplicate across outlets without a URL still counts as a copy when
    // similarity is extreme; independence requires distinct reporting.
    if (nearDupOther && textSimilarity(`${nearDupOther.title}`, `${document.title}`) >= 0.95) {
      result.push(
        assignRole(
          document,
          nearDupOther,
          "syndicated_copy",
          "Near-identical headline without distinct reporting evidence.",
        ),
      );
      continue;
    }

    if (!document.canonicalUrl && !document.summary && document.tokenCount < INCIDENT_LIMITS.minTokensForSimilarity) {
      result.push(
        assignRole(document, null, "unknown_provenance", "Too little text to judge independence."),
      );
      continue;
    }

    result.push(
      assignRole(document, null, "independent", "No syndication or near-duplicate match found."),
    );
  }

  return result;
}
