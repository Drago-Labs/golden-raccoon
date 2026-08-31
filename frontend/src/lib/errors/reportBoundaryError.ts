/**
 * Emits a boundary error report from the browser (issue #134).
 *
 * The payload is built here rather than serialised from the error, so only the
 * four fields below can ever leave the page. The error's *message* is
 * deliberately absent: in production Next.js replaces it for server-thrown
 * errors anyway, and in development it is the field most likely to contain an
 * address, an amount, or a query someone pasted.
 */

import { categorizeBoundaryError, type ErrorCategory } from "@/lib/errors/boundaryCategory";
import { redactReportText } from "@/lib/errors/redactReport";

const REPORT_ENDPOINT = "/api/observability/client-error";

export type BoundaryReport = {
  route: string;
  category: ErrorCategory;
  digest?: string;
  name?: string;
};

/** Builds the report for an error caught on `route`. */
export function buildBoundaryReport(
  error: unknown,
  route: string,
  category: ErrorCategory = categorizeBoundaryError(error),
): BoundaryReport {
  // Redacted here, at the source: a route can carry an address, and
  // redacting only on arrival still puts it on the wire.
  const report: BoundaryReport = { route: redactReportText(route), category };

  if (typeof error === "object" && error !== null) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest !== "") {
      report.digest = redactReportText(digest);
    }

    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && name !== "") {
      report.name = redactReportText(name);
    }
  }

  return report;
}

/**
 * Sends the report, and never lets reporting break the boundary.
 *
 * A boundary is already the failure path: if the report cannot be delivered the
 * user still needs the recovery screen, so every error here is swallowed.
 */
export function reportBoundaryError(
  error: unknown,
  route: string,
  category?: ErrorCategory,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const body = JSON.stringify(buildBoundaryReport(error, route, category));

    void fetch(REPORT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Reporting is best effort.
    });
  } catch {
    // Reporting is best effort.
  }
}
