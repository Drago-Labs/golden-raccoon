"use client";

/**
 * Last boundary in the tree (issue #134).
 *
 * `global-error.tsx` replaces the root layout, so nothing mounted above it
 * survives: no router, no providers, no app shell. It therefore cannot use
 * `ErrorRecoveryPanel`, which depends on `next/navigation`, and repeats the
 * minimum instead — categorise, report, and offer one action that works with
 * only the browser.
 */

import { useEffect } from "react";

import {
  categorizeBoundaryError,
  descriptionForCategory,
  headlineForCategory,
  resolveRecovery,
  type BoundaryError,
} from "@/lib/errors/boundaryCategory";
import { reportBoundaryError } from "@/lib/errors/reportBoundaryError";

export default function GlobalError({
  error,
  reset,
}: {
  error: BoundaryError;
  reset: () => void;
}) {
  const category = categorizeBoundaryError(error);
  // A fault that took out the root layout is not one to retry in place.
  const recovery = resolveRecovery(category, false);

  useEffect(() => {
    reportBoundaryError(error, "/", category);
  }, [error, category]);

  return (
    <html lang="en">
      <body>
        <section
          role="alert"
          aria-labelledby="global-error-heading"
          data-testid="global-error-panel"
          data-error-category={category}
          data-recovery-action={recovery.kind}
          className="flex min-h-screen flex-col items-center justify-center gap-4 bg-red-50 p-8"
        >
          <h2 id="global-error-heading" className="text-xl font-semibold text-red-900">
            {headlineForCategory(category)}
          </h2>

          <p className="max-w-xl text-center text-red-800">
            {descriptionForCategory(category)}
          </p>

          <button
            type="button"
            onClick={() => reset()}
            className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          >
            Restart application
          </button>

          {error.digest ? (
            <p className="text-xs text-red-700">
              Reference: <code data-testid="error-digest">{error.digest}</code>
            </p>
          ) : null}
        </section>
      </body>
    </html>
  );
}
