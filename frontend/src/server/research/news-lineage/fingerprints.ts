/**
 * Text fingerprints for duplicate detection.
 *
 * Similarity is a weak signal and is treated as one: it can only place two
 * articles in a lineage under the weakest reason code, and it is refused
 * entirely when either article is too sparse to judge. Documented syndication
 * always outranks it.
 */
import { LINEAGE_LIMITS } from "./schema";

/**
 * Splits text into comparable tokens.
 *
 * Unicode letters and numbers are kept, so non-Latin scripts tokenize properly
 * rather than collapsing to nothing. A Turkish or Japanese headline must not
 * look "sparse" purely because the tokenizer only understood ASCII.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1);
}

/** Overlapping word trigrams; falls back to tokens for very short text. */
export function shingles(tokens: string[]): Set<string> {
  if (tokens.length < 3) return new Set(tokens);

  const result = new Set<string>();

  for (let index = 0; index + 2 < tokens.length; index += 1) {
    result.add(`${tokens[index]} ${tokens[index + 1]} ${tokens[index + 2]}`);
  }

  return result;
}

export function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }

  const union = left.size + right.size - intersection;

  return union === 0 ? 0 : Number((intersection / union).toFixed(6));
}

export type TextComparison = {
  similarity: number | null;
  exact: boolean;
  /** Set when a comparison could not be made at all. */
  refusedReason: string | null;
};

export function compareText(
  leftText: string,
  rightText: string,
  leftTokenCount: number,
  rightTokenCount: number,
): TextComparison {
  if (
    leftTokenCount < LINEAGE_LIMITS.minTokensForSimilarity ||
    rightTokenCount < LINEAGE_LIMITS.minTokensForSimilarity
  ) {
    return {
      similarity: null,
      exact: false,
      refusedReason: `At least one article carries fewer than ${LINEAGE_LIMITS.minTokensForSimilarity} usable tokens. Text similarity is unreliable at that length, so no text-based clustering is attempted.`,
    };
  }

  const leftTokens = tokenize(leftText);
  const rightTokens = tokenize(rightText);

  if (leftTokens.join(" ") === rightTokens.join(" ")) {
    return { similarity: 1, exact: true, refusedReason: null };
  }

  return { similarity: jaccard(shingles(leftTokens), shingles(rightTokens)), exact: false, refusedReason: null };
}
