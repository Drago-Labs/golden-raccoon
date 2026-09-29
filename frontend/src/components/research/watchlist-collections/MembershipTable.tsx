"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { Membership, Tag } from "@/server/research/watchlist-collections/schema";

/**
 * The assets inside the selected collection, in manual order.
 *
 * Reordering is done with Move up / Move down buttons rather than drag and
 * drop, so the ordering is usable from the keyboard. A membership whose
 * watchlist entry has gone keeps its row, flagged — the user should see the
 * gap rather than find the row silently missing.
 */
export function MembershipTable({
  memberships,
  tags,
  busy,
  onMove,
  onRemove,
}: {
  memberships: Membership[];
  tags: Tag[];
  busy: boolean;
  onMove: (membershipId: string, direction: -1 | 1) => void;
  onRemove: (membershipId: string) => void;
}) {
  if (memberships.length === 0) {
    return (
      <p data-testid="memberships-empty" className="text-sm text-white/54">
        This collection is empty. Adding an asset here does not change your watchlist — it only records that the asset belongs
        to this group.
      </p>
    );
  }

  const labelFor = (tagId: string) => tags.find((tag) => tag.id === tagId)?.label ?? tagId;

  return (
    <div data-testid="membership-table" className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <caption className="sr-only">Assets in this collection, in manual order</caption>
        <thead>
          <tr className="text-xs uppercase tracking-[0.12em] text-white/42">
            <th scope="col" className="py-2 pr-4 font-medium">
              Order
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Watchlist entry
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Tags
            </th>
            <th scope="col" className="py-2 font-medium">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {memberships.map((membership, index) => (
            <tr key={membership.id} className="border-t border-white/8 align-top">
              <td className="py-3 pr-4 text-xs tabular-nums text-white/54">{index + 1}</td>
              <td className="py-3 pr-4">
                <span className="break-all font-mono text-xs text-white/78">{membership.watchlistEntryId}</span>
                {membership.referenceMissing ? (
                  <span className="mt-1.5 block">
                    <StatusBadge tone="warning">No longer watched</StatusBadge>
                  </span>
                ) : null}
              </td>
              <td className="py-3 pr-4 text-xs text-white/54">
                {membership.tagIds.length === 0 ? "—" : membership.tagIds.map(labelFor).join(", ")}
              </td>
              <td className="py-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || index === 0}
                    onClick={() => onMove(membership.id, -1)}
                    aria-label={`Move ${membership.watchlistEntryId} up`}
                    className="rounded-xl border border-white/10 px-2.5 py-1 text-xs text-white/70 transition hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-40"
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    disabled={busy || index === memberships.length - 1}
                    onClick={() => onMove(membership.id, 1)}
                    aria-label={`Move ${membership.watchlistEntryId} down`}
                    className="rounded-xl border border-white/10 px-2.5 py-1 text-xs text-white/70 transition hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-40"
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRemove(membership.id)}
                    aria-label={`Remove ${membership.watchlistEntryId} from this collection`}
                    className="rounded-xl border border-white/10 px-2.5 py-1 text-xs text-white/70 transition hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
