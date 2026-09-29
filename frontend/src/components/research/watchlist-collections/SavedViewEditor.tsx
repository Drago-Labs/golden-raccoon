"use client";

import { useId, useState } from "react";
import type { Collection, SavedView, Tag } from "@/server/research/watchlist-collections/schema";

/**
 * Named filters over the wallet's own collections and tags.
 *
 * Only the caller's own collections and tags are offered, and the server
 * checks the ids again — the list here is a convenience, never the
 * authorization.
 */
export function SavedViewEditor({
  views,
  collections,
  tags,
  busy,
  onSave,
  onDelete,
}: {
  views: SavedView[];
  collections: Collection[];
  tags: Tag[];
  busy: boolean;
  onSave: (view: { name: string; collectionIds: string[]; tagIds: string[] }) => void;
  onDelete: (id: string) => void;
}) {
  const nameId = useId();
  const collectionId = useId();
  const tagId = useId();

  const [name, setName] = useState("");
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  return (
    <div className="flex flex-col gap-4">
      <form
        aria-label="Save view"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();

          if (name.trim().length === 0) return;

          onSave({ name: name.trim(), collectionIds: selectedCollections, tagIds: selectedTags });
          setName("");
          setSelectedCollections([]);
          setSelectedTags([]);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
            View name
          </label>
          <input
            id={nameId}
            name="name"
            value={name}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40"
          />
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor={collectionId} className="text-xs text-white/54">
              Collections
            </label>
            <select
              id={collectionId}
              name="collectionIds"
              multiple
              value={selectedCollections}
              onChange={(event) =>
                setSelectedCollections([...event.target.selectedOptions].map((option) => option.value))
              }
              className="w-full rounded-2xl border border-white/12 bg-white/5 px-3 py-2 text-sm text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40"
            >
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id} className="bg-[#151515]">
                  {collection.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor={tagId} className="text-xs text-white/54">
              Tags
            </label>
            <select
              id={tagId}
              name="tagIds"
              multiple
              value={selectedTags}
              onChange={(event) => setSelectedTags([...event.target.selectedOptions].map((option) => option.value))}
              className="w-full rounded-2xl border border-white/12 bg-white/5 px-3 py-2 text-sm text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40"
            >
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id} className="bg-[#151515]">
                  {tag.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-2xl border border-white/14 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/16 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50"
          >
            Save view
          </button>
        </div>
      </form>

      {views.length === 0 ? (
        <p className="text-sm text-white/54">No saved views yet.</p>
      ) : (
        <ul data-testid="saved-view-list" className="flex flex-col gap-2">
          {views.map((view) => (
            <li key={view.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3">
              <span className="text-sm text-white/78">
                {view.name}
                <span className="mt-0.5 block text-xs text-white/42">
                  {view.filter.collectionIds.length} collection(s), {view.filter.tagIds.length} tag(s)
                </span>
              </span>
              <button
                type="button"
                onClick={() => onDelete(view.id)}
                aria-label={`Delete the saved view ${view.name}`}
                className="rounded-xl border border-white/10 px-3 py-1 text-xs text-white/54 transition hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
