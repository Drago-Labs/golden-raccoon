import { POLICY_CHANGE_LIMITS } from "./limits";

/**
 * Extracts readable text from an HTML (or plain-text) page body.
 *
 * This is a bounded, dependency-free extractor: it strips script/style
 * blocks and tags, decodes a small set of common entities, and collapses
 * whitespace. It is not a full HTML parser — good enough for diffing
 * policy prose, not for rendering the page.
 */
export function extractReadableText(body: string, contentType: string | null): string {
  const isHtml = !contentType || /text\/html|application\/xhtml\+xml/i.test(contentType);
  if (!isHtml) {
    return normalizeWhitespace(body).slice(0, POLICY_CHANGE_LIMITS.maxExtractedChars);
  }

  const withoutScripts = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const withBreaks = withoutScripts.replace(/<(p|br|div|li|h[1-6]|tr)\b[^>]*>/gi, "\n");
  const withoutTags = withBreaks.replace(/<[^>]+>/g, " ");

  const decoded = decodeEntities(withoutTags);
  return normalizeWhitespace(decoded).slice(0, POLICY_CHANGE_LIMITS.maxExtractedChars);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"');
}

function normalizeWhitespace(value: string): string {
  return value
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** Splits extracted text into non-empty paragraphs (one per line, after normalization). */
export function splitParagraphs(text: string): string[] {
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

/** Splits a paragraph into sentences using a simple, bounded heuristic. */
export function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}
