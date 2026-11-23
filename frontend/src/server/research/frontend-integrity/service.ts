import { buildCoverage } from "./coverage";
import { parseDomain } from "./domainInput";
import { FrontendIntegrityError, type WorkState } from "./errors";
import { readSecurityHeaders } from "./headerReader";
import { findOriginIssues } from "./originFindings";
import { fetchRecordedPage } from "./pageFetch";
import { diffSnapshots } from "./snapshotDiff";
import { extractScripts } from "./scriptExtraction";
import type { IntegrityReport, Snapshot } from "./schema";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

let sequence = 0;

function snapshotFrom(domain: string, html: unknown, headers: unknown): Snapshot {
  const page = fetchRecordedPage(html, headers);
  const origin = `https://${domain}`;
  sequence += 1;
  return {
    id: `snap-${sequence}`,
    domain,
    scripts: extractScripts(page.html, origin),
    headers: readSecurityHeaders(page.headers),
  };
}

/** Compare a recorded page with the previous recorded page. No script is executed. */
export function analyseFrontendIntegrity(value: unknown): WorkState<IntegrityReport> {
  const body = asRecord(value);
  if (!body) return { kind: "unknown_format", reason: "The snapshot payload is not an object." };
  if (body.unavailable === true) {
    return { kind: "unavailable", reason: typeof body.reason === "string" ? body.reason : "The page did not answer." };
  }
  try {
    const domain = parseDomain(body.domain);
    const current = snapshotFrom(domain, body.html, body.headers);
    const previous = body.previousHtml === undefined ? null : snapshotFrom(domain, body.previousHtml, body.previousHeaders ?? {});
    const diff = diffSnapshots(previous, current);
    const previousOrigins = new Set((previous?.scripts ?? []).map((script) => script.origin));
    return {
      kind: "ready",
      report: {
        domain,
        current,
        previous,
        diff,
        findings: findOriginIssues(current.scripts, `https://${domain}`, previousOrigins),
        coverage: buildCoverage([]),
      },
    };
  } catch (error) {
    if (error instanceof FrontendIntegrityError && error.code === "payload_too_large") {
      return { kind: "unknown_format", reason: error.message };
    }
    if (error instanceof FrontendIntegrityError) return { kind: "unknown_format", reason: error.message };
    return { kind: "unknown_format", reason: "The page snapshot could not be read." };
  }
}
