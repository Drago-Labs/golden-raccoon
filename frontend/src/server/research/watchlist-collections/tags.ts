/**
 * Tag normalization.
 *
 * "DeFi", "defi" and "  DeFi  " are one tag. Without normalization a user ends
 * up with three tags that look identical in a list and filter differently,
 * which is worse than not having tags. The display label keeps the casing the
 * user typed; `normalized` is what uniqueness is decided on.
 */
import { COLLECTION_LIMITS, CollectionsError, type OwnerScope, type Tag } from "./schema";
import { canonicalOwner } from "./ownership";

export function normalizeTagLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    // Internal runs of whitespace collapse, so "blue chip" and "blue  chip"
    // are the same tag.
    .replace(/\s+/g, " ");
}

export function buildTag(input: { id: string; owner: OwnerScope; label: string; createdAt: string }): Tag {
  const label = input.label.trim();
  const normalized = normalizeTagLabel(label);

  if (normalized.length === 0) {
    throw new CollectionsError("invalid_tag", "A tag needs at least one non-whitespace character.");
  }

  if (label.length > COLLECTION_LIMITS.maxNameLength) {
    throw new CollectionsError("invalid_tag", `A tag label may be at most ${COLLECTION_LIMITS.maxNameLength} characters.`);
  }

  return { id: input.id, owner: canonicalOwner(input.owner), label, normalized, createdAt: input.createdAt };
}

/** The existing tag a label would collide with, if any. */
export function findExistingTag(tags: Tag[], label: string): Tag | undefined {
  const normalized = normalizeTagLabel(label);

  return tags.find((tag) => tag.normalized === normalized);
}
