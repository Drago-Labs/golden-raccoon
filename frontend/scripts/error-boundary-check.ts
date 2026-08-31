/**
 * Route error boundary check (issue #134). Run it with:
 *
 *   cd frontend && npm run test:error-boundaries
 *
 * Asserts the boundary contract:
 *   - Every route segment that renders a page has an `error.tsx`
 *   - Each of those boundaries renders for a forced throw
 *   - A provider outage gets the provider recovery action, not a generic one
 *   - Segments whose render costs money or submits a transaction never offer
 *     "Retry"
 *   - The dynamic segment has a `not-found.tsx`, and its page routes a missing
 *     id there instead of rendering a 200
 *   - Reports carry no address, amount, secret, or unexpected field
 *   - Every provider error code and every category has a decided outcome
 *
 * The boundaries are rendered as they actually ship: the script loads each
 * `error.tsx` and renders its default export.
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ERROR_CATEGORIES,
  categorizeBoundaryError,
  descriptionForCategory,
  headlineForCategory,
  recoveryForCategory,
  resolveRecovery,
  type BoundaryError,
  type ErrorCategory,
} from "../src/lib/errors/boundaryCategory";
import { buildBoundaryReport } from "../src/lib/errors/reportBoundaryError";
import {
  CLIENT_ERROR_REPORT_FIELDS,
  redactClientErrorText,
  sanitizeClientErrorReport,
} from "../src/server/observability/clientErrors";

const appDir = fileURLToPath(new URL("../src/app", import.meta.url));

/** Segments whose render is billable or irreversible; retry must be withheld. */
const RETRY_UNSAFE_SEGMENTS = new Set(["scan", "discovery/scan", "recovery"]);

const STELLAR_ADDRESS = "GC4VWBK5QSJCBSRWIZJYWCF2SJAPCKU3OFHH4XK7ZBTZ5HCK7VYLU6FL";
const STELLAR_SECRET = "SAKICEVQLYWGSOJS4WW7HZJWAHZVEEBS527LHK5V4MLJALYKICQCJXMW";
const EVM_ADDRESS = "0x686Be1DEF4b9Bd725A5Df07505E25a94Fa71394c";

function providerError(code: string): BoundaryError {
  const error = new Error("provider unavailable") as BoundaryError;
  error.name = "StellarDataLayerError";
  error.code = code;
  error.digest = "abc123digest";
  return error;
}

/** Every segment directory under src/app that renders a page. */
function pageSegments(): string[] {
  const found: string[] = [];

  function walk(dir: string, relative: string) {
    for (const entry of readdirSync(dir)) {
      const absolute = path.join(dir, entry);
      if (!statSync(absolute).isDirectory()) continue;
      // Route handlers have no UI, so no boundary applies.
      if (relative === "" && entry === "api") continue;

      const nextRelative = relative === "" ? entry : `${relative}/${entry}`;
      if (existsSync(path.join(absolute, "page.tsx"))) {
        found.push(nextRelative);
      }
      walk(absolute, nextRelative);
    }
  }

  walk(appDir, "");
  return found.sort();
}

async function loadBoundary(segment: string) {
  const imported = (await import(path.join(appDir, segment, "error.tsx"))) as {
    default: React.ComponentType<{ error: BoundaryError; reset: () => void }>;
  };
  return imported.default;
}

function renderBoundary(
  Boundary: React.ComponentType<{ error: BoundaryError; reset: () => void }>,
  error: BoundaryError,
): string {
  return renderToStaticMarkup(React.createElement(Boundary, { error, reset: () => {} }));
}

function attribute(markup: string, name: string): string | undefined {
  return new RegExp(`${name}="([^"]+)"`).exec(markup)?.[1];
}

async function main() {
  const segments = pageSegments();
  assert.ok(segments.length >= 10, `expected the app to have segments, found ${segments.length}`);

  // ---- Every segment renders a boundary instead of the framework default ----
  const missing = segments.filter(
    (segment) => !existsSync(path.join(appDir, segment, "error.tsx")),
  );
  assert.deepEqual(missing, [], `segments without an error.tsx: ${missing.join(", ")}`);

  assert.ok(existsSync(path.join(appDir, "error.tsx")), "root error.tsx is missing");
  assert.ok(existsSync(path.join(appDir, "global-error.tsx")), "global-error.tsx is missing");

  // ---- Each boundary renders for a forced throw ----
  for (const segment of segments) {
    const Boundary = await loadBoundary(segment);
    const markup = renderBoundary(Boundary, providerError("rpc_error"));

    assert.match(
      markup,
      /data-testid="error-recovery-panel"/,
      `${segment} boundary did not render a recovery panel`,
    );
    assert.match(markup, /role="alert"/, `${segment} boundary is not announced as an alert`);
    assert.match(markup, /abc123digest/, `${segment} boundary did not surface the digest`);
  }

  // ---- A provider outage gets the provider action, not a generic message ----
  for (const segment of segments) {
    const Boundary = await loadBoundary(segment);
    const markup = renderBoundary(Boundary, providerError("rpc_error"));

    assert.equal(
      attribute(markup, "data-error-category"),
      "provider_outage",
      `${segment} did not categorise a provider error as an outage`,
    );
    assert.match(
      markup,
      /data provider is unavailable/i,
      `${segment} showed a generic message for a provider outage`,
    );
    assert.doesNotMatch(
      markup,
      /An error occurred/,
      `${segment} still shows the placeholder copy`,
    );
  }

  // ---- Billable and irreversible segments never offer retry ----
  for (const segment of segments) {
    const Boundary = await loadBoundary(segment);
    const action = attribute(
      renderBoundary(Boundary, providerError("timeout")),
      "data-recovery-action",
    );

    if (RETRY_UNSAFE_SEGMENTS.has(segment)) {
      assert.notEqual(
        action,
        "retry",
        `${segment} offered retry, which re-runs a paid scan or resubmits a transaction`,
      );
      assert.equal(action, "go_back", `${segment} should fall back to going back`);
    } else {
      assert.equal(action, "retry", `${segment} should offer retry for a retryable outage`);
    }
  }

  // ---- Each category reaches its own recovery action ----
  const categoryCases: Array<[BoundaryError, ErrorCategory, string]> = [
    [providerError("rpc_error"), "provider_outage", "retry"],
    [providerError("missing_entry"), "not_found", "go_back"],
    [providerError("network_mismatch"), "wallet", "reconnect_wallet"],
    [providerError("malformed_xdr"), "client_bug", "contact_operations"],
  ];

  const Dashboard = await loadBoundary("dashboard");
  for (const [error, expectedCategory, expectedAction] of categoryCases) {
    const markup = renderBoundary(Dashboard, error);
    assert.equal(attribute(markup, "data-error-category"), expectedCategory);
    assert.equal(attribute(markup, "data-recovery-action"), expectedAction);
  }

  // An unrecognisable error must fail closed to a client bug, never to "retry".
  assert.equal(categorizeBoundaryError(new Error("boom")), "client_bug");
  assert.equal(categorizeBoundaryError(undefined), "client_bug");
  assert.equal(categorizeBoundaryError({ status: 404 }), "not_found");
  assert.equal(categorizeBoundaryError({ status: 429 }), "rate_limited");
  assert.equal(categorizeBoundaryError({ status: 503 }), "provider_outage");

  // ---- Every category has copy and a recovery action ----
  for (const category of ERROR_CATEGORIES) {
    assert.ok(headlineForCategory(category).length > 0, `${category} has no headline`);
    assert.ok(descriptionForCategory(category).length > 0, `${category} has no description`);
    assert.ok(recoveryForCategory(category).kind, `${category} has no recovery action`);

    // Fail closed: no boundary may describe the page as complete or safe.
    const description = descriptionForCategory(category).toLowerCase();
    for (const forbidden of ["everything is fine", "no problem", "safe to proceed"]) {
      assert.ok(!description.includes(forbidden), `${category} reassures the user`);
    }
  }

  // A retry is downgraded, never upgraded, when retrying is unsafe.
  for (const category of ERROR_CATEGORIES) {
    assert.notEqual(
      resolveRecovery(category, false).kind,
      "retry",
      `${category} still retried on a retry-unsafe route`,
    );
  }

  // ---- The dynamic segment answers not-found ----
  const dynamicSegment = path.join(appDir, "snapshots", "[id]");
  assert.ok(
    existsSync(path.join(dynamicSegment, "not-found.tsx")),
    "snapshots/[id] has no not-found.tsx",
  );

  const snapshotPage = readFileSync(path.join(dynamicSegment, "page.tsx"), "utf8");
  assert.match(
    snapshotPage,
    /notFound\(\)/,
    "snapshots/[id] does not route a missing id to not-found",
  );
  assert.match(
    snapshotPage,
    /result\.code === "not_found"/,
    "snapshots/[id] must route only a missing id to not-found, not every failure",
  );

  // ---- Reports carry nothing sensitive ----
  const leaky = buildBoundaryReport(
    Object.assign(new Error(`balance 1234.5678901 for ${STELLAR_ADDRESS}`), {
      digest: "d1",
      name: "Error",
    }),
    `/snapshots/${STELLAR_ADDRESS}`,
  );

  const serialized = JSON.stringify(leaky);
  assert.ok(!serialized.includes(STELLAR_ADDRESS), "report leaked a Stellar address");
  assert.ok(!serialized.includes("balance"), "report leaked the error message");

  const sanitized = sanitizeClientErrorReport({
    ...leaky,
    // Fields a future caller might add; the allowlist must drop them.
    walletAddress: STELLAR_ADDRESS,
    balances: [{ asset: "XLM", amount: "1234.5678901" }],
    secret: STELLAR_SECRET,
    message: `held by ${EVM_ADDRESS}`,
  });

  assert.ok(sanitized.ok, "a well-formed report was rejected");
  const stored = JSON.stringify(sanitized.report);

  for (const secretish of [STELLAR_ADDRESS, STELLAR_SECRET, EVM_ADDRESS, "1234.5678901", "balances"]) {
    assert.ok(!stored.includes(secretish), `sanitized report leaked ${secretish}`);
  }

  assert.deepEqual(
    Object.keys(sanitized.report).filter((key) => !CLIENT_ERROR_REPORT_FIELDS.includes(key)),
    [],
    "sanitized report kept a field outside the allowlist",
  );

  // Redaction covers each shape directly.
  assert.ok(!redactClientErrorText(STELLAR_ADDRESS).includes(STELLAR_ADDRESS));
  assert.ok(!redactClientErrorText(EVM_ADDRESS).includes(EVM_ADDRESS));
  assert.ok(!redactClientErrorText(STELLAR_SECRET).includes(STELLAR_SECRET));
  assert.ok(!redactClientErrorText(`tx ${"f".repeat(64)}`).includes("f".repeat(64)));
  assert.equal(redactClientErrorText("amount 12.5"), "amount [AMOUNT]");

  // Malformed input is refused rather than partly stored.
  assert.deepEqual(sanitizeClientErrorReport(null), { ok: false, code: "malformed" });
  assert.deepEqual(sanitizeClientErrorReport([]), { ok: false, code: "malformed" });
  assert.deepEqual(sanitizeClientErrorReport({ route: "/x" }), {
    ok: false,
    code: "unknown_category",
  });
  assert.deepEqual(sanitizeClientErrorReport({ route: "/x", category: "made_up" }), {
    ok: false,
    code: "unknown_category",
  });

  console.log(
    `error-boundary-check: ${segments.length} segments, ${ERROR_CATEGORIES.length} categories, all boundaries render and report cleanly.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
