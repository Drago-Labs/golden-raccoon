"use client";

import type { Collection, Membership } from "@/server/research/watchlist-collections/schema";

/**
 * The list of collections, as a single-select listbox.
 *
 * It is a list of buttons rather than a custom widget, so arrow keys, Tab and
 * a screen reader all work without any keyboard handling of our own.
 */
export function CollectionSidebar({
  collections,
  memberships,
  selectedId,
  onSelect,
  onDelete,
}: {
  collections: Collection[];
  memberships: Membership[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (collections.length === 0) {
    return (
      <p data-testid="collections-empty" className="text-sm text-white/54">
        No collections yet. Create one to group the assets you already watch — the assets themselves stay where they are.
      </p>
    );
  }

  return (
    <ul data-testid="collection-sidebar" className="flex flex-col gap-2">
      {collections.map((collection) => {
        const count = memberships.filter((membership) => membership.collectionId === collection.id).length;
        const selected = collection.id === selectedId;

        return (
          <li key={collection.id} className="flex items-stretch gap-2">
            <button
              type="button"
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(collection.id)}
              className={`flex-1 rounded-2xl border px-4 py-3 text-left text-sm transition focus-visible:ring-2 focus-visible:ring-white/40 ${
                selected ? "border-white/30 bg-white/12 text-white" : "border-white/10 bg-white/4 text-white/70 hover:bg-white/8"
              }`}
            >
              <span className="block font-medium">{collection.name}</span>
              <span className="mt-0.5 block text-xs text-white/42">
                {count} asset{count === 1 ? "" : "s"}
                {collection.description ? ` · ${collection.description}` : ""}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onDelete(collection.id)}
              aria-label={`Delete the collection ${collection.name}`}
              className="rounded-2xl border border-white/10 px-3 text-xs text-white/54 transition hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40"
            >
              Delete
            </button>
          </li>
        );
      })}
    </ul>
  );
}
