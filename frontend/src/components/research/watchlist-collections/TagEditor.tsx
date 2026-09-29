"use client";

import { useId, useState } from "react";
import type { Tag } from "@/server/research/watchlist-collections/schema";

/**
 * Tag creation and removal.
 *
 * The hint below the field states the normalization rule up front, because a
 * user who types "DeFi" and gets back an existing "defi" should understand why
 * rather than think the app dropped their input.
 */
export function TagEditor({
  tags,
  busy,
  onCreate,
  onDelete,
}: {
  tags: Tag[];
  busy: boolean;
  onCreate: (label: string) => void;
  onDelete: (id: string) => void;
}) {
  const labelId = useId();
  const [label, setLabel] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <form
        aria-label="Create tag"
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();

          if (label.trim().length === 0) return;

          onCreate(label.trim());
          setLabel("");
        }}
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={labelId} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
            New tag
          </label>
          <input
            id={labelId}
            name="label"
            value={label}
            autoComplete="off"
            onChange={(event) => setLabel(event.target.value)}
            aria-describedby={`${labelId}-hint`}
            className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40"
          />
          <p id={`${labelId}-hint`} className="text-xs text-white/42">
            Case and extra spacing are ignored when matching, so &ldquo;DeFi&rdquo; and &ldquo;defi&rdquo; are the same tag.
          </p>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="rounded-2xl border border-white/14 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/16 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50"
        >
          Add tag
        </button>
      </form>

      {tags.length === 0 ? (
        <p className="text-sm text-white/54">No tags yet.</p>
      ) : (
        <ul data-testid="tag-list" className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag.id}>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs text-white/78">
                {tag.label}
                <button
                  type="button"
                  onClick={() => onDelete(tag.id)}
                  aria-label={`Delete the tag ${tag.label}`}
                  className="rounded-full px-1 text-white/42 transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
