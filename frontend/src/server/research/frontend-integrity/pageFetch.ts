import { FRONTEND_INTEGRITY_LIMITS } from "./limits";
import { FrontendIntegrityError } from "./errors";

export type RecordedPage = { html: string; headers: Record<string, string> };

/**
 * Returns the recorded page body as text. It does not parse the document with
 * the browser and it does not evaluate script bodies.
 */
export function fetchRecordedPage(html: unknown, headers: unknown): RecordedPage {
  if (typeof html !== "string") {
    throw new FrontendIntegrityError("unknown_format", "The page body was not text.");
  }
  if (html.length > FRONTEND_INTEGRITY_LIMITS.maxHtmlBytes) {
    throw new FrontendIntegrityError("payload_too_large", "The recorded page exceeds the size ceiling.");
  }
  const safeHeaders: Record<string, string> = {};
  if (headers !== undefined && headers !== null) {
    if (typeof headers !== "object" || Array.isArray(headers)) {
      throw new FrontendIntegrityError("unknown_format", "Headers were not an object.");
    }
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === "string") safeHeaders[key.toLowerCase()] = value;
    }
  }
  return { html, headers: safeHeaders };
}
