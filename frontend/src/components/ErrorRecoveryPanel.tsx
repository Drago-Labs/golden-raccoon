"use client";

/**
 * The recovery screen every route boundary renders (issue #134).
 *
 * One component so that each segment's `error.tsx` stays a three-line
 * declaration of *what is true about that route* — its path, and whether
 * rendering it again is safe — rather than a copy of the same markup.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  categorizeBoundaryError,
  descriptionForCategory,
  headlineForCategory,
  resolveRecovery,
  type BoundaryError,
} from "@/lib/errors/boundaryCategory";
import { reportBoundaryError } from "@/lib/errors/reportBoundaryError";

export type ErrorRecoveryPanelProps = {
  error: BoundaryError;
  /** Next.js re-render for this segment. */
  reset: () => void;
  /** Route the boundary guards, used for the report and for reconnecting. */
  route: string;
  /**
   * Whether re-rendering this route is free of side effects. `false` on any
   * segment whose render submits a transaction or starts a paid scan; the
   * boundary then offers "Go back" instead of "Retry".
   */
  retrySafe?: boolean;
};

export function ErrorRecoveryPanel({
  error,
  reset,
  route,
  retrySafe = true,
}: ErrorRecoveryPanelProps) {
  const router = useRouter();
  const category = categorizeBoundaryError(error);
  const recovery = resolveRecovery(category, retrySafe);

  useEffect(() => {
    reportBoundaryError(error, route, category);
  }, [error, route, category]);

  function handleRecover() {
    switch (recovery.kind) {
      case "retry":
        reset();
        return;
      case "go_back":
        router.back();
        return;
      case "reconnect_wallet":
        // A full load of the same route re-runs wallet session restoration and
        // puts the connect control back in the header.
        window.location.assign(route);
        return;
      case "contact_operations":
        router.push("/operations");
    }
  }

  return (
    <section
      role="alert"
      aria-labelledby="error-recovery-heading"
      data-testid="error-recovery-panel"
      data-error-category={category}
      data-recovery-action={recovery.kind}
      className="mx-auto flex max-w-xl flex-col gap-4 rounded-lg border border-red-200 bg-red-50 p-8"
    >
      <h2 id="error-recovery-heading" className="text-xl font-semibold text-red-900">
        {headlineForCategory(category)}
      </h2>

      <p className="text-red-800">{descriptionForCategory(category)}</p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleRecover}
          className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
        >
          {recovery.label}
        </button>

        {recovery.kind !== "contact_operations" ? (
          <Link href="/operations" className="text-sm text-red-800 underline">
            Contact operations
          </Link>
        ) : null}
      </div>

      {error.digest ? (
        <p className="text-xs text-red-700">
          Reference: <code data-testid="error-digest">{error.digest}</code>
        </p>
      ) : null}
    </section>
  );
}
