"use client";

import { useId, useState } from "react";

export type RunOption = { id: string; label: string };

/**
 * Picks the two runs to compare.
 *
 * The selection is bounded to two by construction: two selects, not a
 * multi-select that could grow. Comparing a run against itself is refused
 * here as well as on the server, with a message rather than a disabled control
 * the user cannot explain.
 */
export function RunPairSelector({
  runs,
  busy,
  onCompare,
}: {
  runs: RunOption[];
  busy: boolean;
  onCompare: (pair: { leftRunId: string; rightRunId: string }) => void;
}) {
  const leftId = useId();
  const rightId = useId();
  const errorId = useId();

  const [left, setLeft] = useState(runs[0]?.id ?? "");
  const [right, setRight] = useState(runs[1]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      aria-label="Run pair"
      className="glass-panel flex flex-col gap-4 rounded-[28px] p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();

        if (!left || !right) {
          setError("Choose two saved runs to compare.");
          return;
        }

        if (left === right) {
          setError("Those are the same run. Choose two different ones.");
          return;
        }

        setError(null);
        onCompare({ leftRunId: left, rightRunId: right });
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={leftId} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
            First run
          </label>
          <select
            id={leftId}
            name="leftRunId"
            value={left}
            onChange={(event) => setLeft(event.target.value)}
            className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40"
          >
            {runs.length === 0 ? <option value="">No saved runs</option> : null}
            {runs.map((run) => (
              <option key={run.id} value={run.id} className="bg-[#151515]">
                {run.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={rightId} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
            Second run
          </label>
          <select
            id={rightId}
            name="rightRunId"
            value={right}
            onChange={(event) => setRight(event.target.value)}
            className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40"
          >
            {runs.length === 0 ? <option value="">No saved runs</option> : null}
            {runs.map((run) => (
              <option key={run.id} value={run.id} className="bg-[#151515]">
                {run.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={busy || runs.length < 2}
          className="rounded-2xl border border-white/14 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/16 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50"
        >
          {busy ? "Comparing…" : "Compare"}
        </button>
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-red-200">
          {error}
        </p>
      ) : null}
    </form>
  );
}
