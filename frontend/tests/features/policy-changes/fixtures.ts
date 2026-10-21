import type { PageFetchResult, PageFetcher, PolicySnapshot } from "@/server/research/policy-changes/schema";
import { extractReadableText } from "@/server/research/policy-changes/textExtraction";
import { hashContent, snapshotIdFor } from "@/server/research/policy-changes/contentHash";

export const TEST_PROJECT_ID = "sdf-terms";

export const ORIGINAL_PAGE_HTML = `
<html><body>
<h1>Terms of Service</h1>
<p>Withdrawal fees are 2% of the transaction amount.</p>
<p>We may change these terms at any time without notice.</p>
</body></html>
`;

export const FEE_CHANGED_PAGE_HTML = `
<html><body>
<h1>Terms of Service</h1>
<p>Withdrawal fees are 5% of the transaction amount.</p>
<p>We may change these terms at any time without notice.</p>
</body></html>
`;

export function createPageFetcher(options: { html?: string; fail?: "timeout" | "http_error" } = {}): PageFetcher {
  return async () => {
    if (options.fail === "timeout") {
      return {
        outcome: "timeout",
        requestedUrl: "https://stellar.org/terms-of-service",
        finalUrl: null,
        httpStatus: null,
        redirectChain: [],
        contentType: null,
        byteLength: null,
        body: null,
        issues: ["The operation was aborted."],
      } satisfies PageFetchResult;
    }
    if (options.fail === "http_error") {
      return {
        outcome: "http_error",
        requestedUrl: "https://stellar.org/terms-of-service",
        finalUrl: "https://stellar.org/terms-of-service",
        httpStatus: 503,
        redirectChain: [],
        contentType: "text/html",
        byteLength: null,
        body: null,
        issues: ["HTTP status 503"],
      } satisfies PageFetchResult;
    }
    return {
      outcome: "ok",
      requestedUrl: "https://stellar.org/terms-of-service",
      finalUrl: "https://stellar.org/terms-of-service",
      httpStatus: 200,
      redirectChain: [],
      contentType: "text/html",
      byteLength: (options.html ?? ORIGINAL_PAGE_HTML).length,
      body: options.html ?? ORIGINAL_PAGE_HTML,
      issues: [],
    } satisfies PageFetchResult;
  };
}

export function priorSnapshotFromHtml(html: string, fetchedAt: string): PolicySnapshot {
  const text = extractReadableText(html, "text/html");
  const contentHash = hashContent(text);
  return {
    snapshotId: snapshotIdFor(TEST_PROJECT_ID, fetchedAt, contentHash),
    projectId: TEST_PROJECT_ID,
    fetchedAt,
    contentHash,
    textExcerpt: text,
    fullTextLength: text.length,
    fetch: {
      requestedUrl: "https://stellar.org/terms-of-service",
      finalUrl: "https://stellar.org/terms-of-service",
      outcome: "ok",
      httpStatus: 200,
      redirectChain: [],
      contentType: "text/html",
      byteLength: html.length,
      fetchedAt,
      issues: [],
    },
  };
}

export function request(overrides: Record<string, unknown> = {}) {
  return {
    projectId: TEST_PROJECT_ID,
    evaluatedAt: "2026-03-01T12:00:00.000Z",
    priorSnapshots: [],
    ...overrides,
  };
}
