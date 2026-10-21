import { POLICY_CHANGE_LIMITS } from "./limits";

/**
 * Treats fetched content as untrusted and renders it safely: this tool
 * never stores or returns raw HTML, and every excerpt is truncated and
 * displayed as plain text (React escapes it by default — nothing here ever
 * uses `dangerouslySetInnerHTML`).
 */
export function safeExcerpt(text: string, maxChars = 4_096): string {
  const bounded = text.length > POLICY_CHANGE_LIMITS.maxExtractedChars ? text.slice(0, POLICY_CHANGE_LIMITS.maxExtractedChars) : text;
  return bounded.length > maxChars ? `${bounded.slice(0, maxChars)}…` : bounded;
}
