/**
 * Shown while `/operations` resolves server-side (issue #134).
 *
 * Without it the segment renders nothing until its data arrives, and a boundary
 * that then appears reads as though the page were blank rather than loading.
 * The text says loading — never that there is no data.
 */
export default function OperationsLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="segment-loading"
      className="mx-auto max-w-xl p-8 text-slate-600"
    >
      Loading…
    </div>
  );
}
