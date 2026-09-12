/**
 * Text similarity for repeat detection.
 *
 * Deliberately simple and deterministic: a Jaccard overlap of word bigrams over
 * the normalized text. It measures how alike two strings are, and nothing more
 * — the caller decides what that means, and this module never labels a pair
 * "coordinated".
 */

export function bigrams(tokens: string[]): Set<string> {
  if (tokens.length === 0) return new Set();
  if (tokens.length === 1) return new Set(tokens);

  const result = new Set<string>();

  for (let index = 0; index + 1 < tokens.length; index += 1) {
    result.add(`${tokens[index]} ${tokens[index + 1]}`);
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

export function similarity(leftTokens: string[], rightTokens: string[]): number {
  if (leftTokens.join(" ") === rightTokens.join(" ")) return 1;
  return jaccard(bigrams(leftTokens), bigrams(rightTokens));
}
