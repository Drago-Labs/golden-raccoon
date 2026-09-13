"use client";

import { useId, useState } from "react";

/**
 * Two-snapshot selector.
 *
 * Ids are entered rather than listed, because snapshot ids are share
 * credentials and this feature deliberately does not enumerate a wallet's
 * snapshots. Validation is client-side only for feedback; the server repeats it.
 */
export function SnapshotSelector({
  initialLeftId,
  initialRightId,
  busy,
  onCompare,
}: {
  initialLeftId?: string;
  initialRightId?: string;
  busy: boolean;
  onCompare: (leftId: string, rightId: string) => void;
}) {
  const leftFieldId = useId();
  const rightFieldId = useId();
  const errorId = useId();
  const [leftId, setLeftId] = useState(initialLeftId ?? "");
  const [rightId, setRightId] = useState(initialRightId ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const left = leftId.trim();
    const right = rightId.trim();

    if (!left || !right) {
      setError("Enter both snapshot ids.");
      return;
    }

    if (left === right) {
      setError("Choose two different snapshots.");
      return;
    }

    setError(null);
    onCompare(left, right);
  }

  return (
    <form onSubmit={submit} className="space-y-3" aria-describedby={error ? errorId : undefined}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={leftFieldId} className="block text-xs text-subtle">
            Earlier snapshot id
          </label>
          <input
            id={leftFieldId}
            value={leftId}
            onChange={(event) => setLeftId(event.target.value)}
            placeholder="snapshot_…"
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 font-mono text-sm"
          />
        </div>
        <div>
          <label htmlFor={rightFieldId} className="block text-xs text-subtle">
            Later snapshot id
          </label>
          <input
            id={rightFieldId}
            value={rightId}
            onChange={(event) => setRightId(event.target.value)}
            placeholder="snapshot_…"
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 font-mono text-sm"
          />
        </div>
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-red-200">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-11 items-center rounded-full border border-[var(--color-border-strong)] px-5 text-sm font-semibold transition hover:bg-white/5 disabled:opacity-50"
      >
        {busy ? "Comparing…" : "Compare snapshots"}
      </button>
      <p className="text-xs text-subtle">
        Ids are read once per comparison and never stored by this page. Comparison performs no snapshot write and cannot
        extend an expiry or bypass a revocation.
      </p>
    </form>
  );
}
