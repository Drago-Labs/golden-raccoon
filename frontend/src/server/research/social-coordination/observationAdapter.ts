/**
 * Normalizes caller-supplied observations.
 *
 * Social text is hostile input by default. It is stripped of markup and of the
 * invisible characters that can hide or reverse what a reader sees, and the
 * original evidence identifier is preserved so any finding can be traced back.
 *
 * An observation that cannot take part in analysis is kept with an
 * `excludedReason` rather than dropped, so the sample size a reader sees is the
 * sample size that was actually analysed.
 */
import { createHash } from "node:crypto";
import { COORDINATION_LIMITS, type ObservationInput, type ObservationRef } from "./schema";

/**
 * Zero-width, bidirectional-override and control characters. Invisible, but
 * able to conceal or reorder displayed text, so they are removed.
 */
const INVISIBLE_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

export function sanitizeText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(INVISIBLE_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, COORDINATION_LIMITS.maxTextLength);
}

/**
 * Collapses the variations a copy-paste campaign typically introduces:
 * case, punctuation, URLs, mentions, emoji and digit runs. Two messages that
 * differ only in a trailing hashtag normalize to the same string.
 */
export function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#]\S+/g, " ")
    .replace(/\d+/g, " ")
    .split(/[^\p{L}]+/u)
    .filter((token) => token.length > 1)
    .join(" ")
    .trim();
}

export function hashNormalized(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 32);
}

export function tokenize(normalized: string): string[] {
  return normalized.split(" ").filter(Boolean);
}

export function adaptObservation(input: ObservationInput): ObservationRef {
  const text = sanitizeText(input.text ?? "");
  const normalized = normalizeForComparison(text);
  const tokens = tokenize(normalized);

  const excludedReason =
    text.length === 0
      ? "This observation carries no text, so it cannot take part in repetition analysis."
      : tokens.length === 0
        ? "After normalization this observation has no comparable words left, so it cannot take part in repetition analysis."
        : null;

  return {
    observationId: input.observationId,
    authorKey: input.authorKey,
    postedAt: input.postedAt ?? null,
    text,
    normalizedTextHash: hashNormalized(normalized),
    tokenCount: tokens.length,
    excludedReason,
  };
}

/** Observations that can take part in text analysis. */
export function analysable(observations: ObservationRef[]): ObservationRef[] {
  return observations.filter((observation) => observation.excludedReason === null);
}
