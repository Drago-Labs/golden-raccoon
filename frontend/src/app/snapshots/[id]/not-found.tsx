import Link from "next/link";

/**
 * Rendered when a snapshot id does not resolve (issue #134).
 *
 * A server component on purpose: a missing snapshot is a known, expected answer
 * rather than a fault, so it needs no client runtime and no error report. The
 * page states that nothing was loaded — it must not read as an empty snapshot.
 */
export default function SnapshotNotFound() {
  return (
    <section
      aria-labelledby="snapshot-not-found-heading"
      data-testid="snapshot-not-found"
      className="mx-auto flex max-w-xl flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-8"
    >
      <h2 id="snapshot-not-found-heading" className="text-xl font-semibold text-slate-900">
        This snapshot does not exist
      </h2>

      <p className="text-slate-700">
        No snapshot was found for that id. It may have expired, been deleted, or the link may be
        wrong. Nothing has been loaded for this page.
      </p>

      <Link href="/dashboard" className="text-sm text-slate-900 underline">
        Back to dashboard
      </Link>
    </section>
  );
}
