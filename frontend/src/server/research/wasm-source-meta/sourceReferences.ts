import { WASM_SOURCE_META_LIMITS } from "./limits";
import type { DeclaredSource } from "./schema";

export type PublishedReference = {
  field: DeclaredSource["field"];
  value: string;
  source: string;
};

/**
 * Resolve project-published source references.
 * Request-supplied declarations take precedence; a small built-in catalog
 * covers known demo contracts for fixture-driven verification.
 */
export function resolveSourceReferences(
  contractId: string,
  declaredSources: DeclaredSource[] | undefined,
): PublishedReference[] {
  const fromRequest = (declaredSources ?? []).slice(0, WASM_SOURCE_META_LIMITS.maxDeclaredSources);
  if (fromRequest.length > 0) {
    return fromRequest.map((entry) => ({
      field: entry.field,
      value: entry.value,
      source: entry.source,
    }));
  }

  return BUILTIN_REFERENCES[contractId] ?? [];
}

const BUILTIN_REFERENCES: Record<string, PublishedReference[]> = {
  CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA: [
    {
      field: "repository",
      value: "https://github.com/example/matching-contract",
      source: "configured-source-list",
    },
    {
      field: "commit",
      value: "abc123def456",
      source: "release-notes",
    },
    {
      field: "sdkVersion",
      value: "22.0.0",
      source: "README",
    },
  ],
  CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB: [
    {
      field: "repository",
      value: "https://github.com/example/published-repo",
      source: "README",
    },
    {
      field: "commit",
      value: "published-commit-999",
      source: "release-notes",
    },
    {
      field: "sdkVersion",
      value: "21.0.0",
      source: "README",
    },
  ],
};
