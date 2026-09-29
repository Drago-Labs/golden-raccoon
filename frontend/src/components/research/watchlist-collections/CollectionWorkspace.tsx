"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { StatusBadge } from "@/components/a11y/StatusBadge";
import { CollectionSidebar } from "./CollectionSidebar";
import { MembershipTable } from "./MembershipTable";
import { SavedViewEditor } from "./SavedViewEditor";
import { TagEditor } from "./TagEditor";
import type { CollectionsSnapshot } from "@/server/research/watchlist-collections/schema";

type FetchState =
  | { status: "loading" }
  | { status: "ready"; snapshot: CollectionsSnapshot }
  | { status: "error"; code: string; message: string };

/**
 * Collection workspace.
 *
 * Keyed by account and network, so switching either remounts the component and
 * discards the previous wallet's collections — combined with the generation
 * guard, a response for one wallet can never paint into another's view.
 *
 * Every mutation round-trips and re-reads the snapshot the server returns.
 * There is no optimistic local copy, because a local copy that disagreed with
 * the server would be a second source of truth for who owns what.
 */
export function CollectionWorkspace(props: {
  account?: string | null;
  network?: string | null;
  endpoint?: string;
  /** Watchlist entry ids the user can add. Supplied by the page. */
  availableEntryIds?: string[];
}) {
  const sessionKey = `${(props.account ?? "anonymous").toLowerCase()}|${props.network ?? "unknown"}`;

  return (
    <WorkspaceSession
      key={sessionKey}
      account={props.account ?? ""}
      network={props.network ?? ""}
      endpoint={props.endpoint ?? "/api/insights/watchlist-collections"}
      availableEntryIds={props.availableEntryIds ?? []}
    />
  );
}

function WorkspaceSession({
  account,
  network,
  endpoint,
  availableEntryIds,
}: {
  account: string;
  network: string;
  endpoint: string;
  availableEntryIds: string[];
}) {
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  const newCollectionId = useId();
  const addEntryId = useId();
  const [newCollectionName, setNewCollectionName] = useState("");
  const [entryToAdd, setEntryToAdd] = useState(availableEntryIds[0] ?? "");

  const send = useCallback(
    async (command: Record<string, unknown>, describe: string) => {
      if (!account || !network) {
        setState({ status: "error", code: "no_wallet", message: "Connect a wallet and choose a network to use collections." });
        return;
      }

      generation.current += 1;
      const requestGeneration = generation.current;

      setBusy(true);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...command, owner: { walletAddress: account, network } }),
        });

        const payload = await response.json();

        // A response for a wallet the user has moved on from is dropped.
        if (requestGeneration !== generation.current) return;

        if (!response.ok) {
          setState((current) =>
            current.status === "ready"
              ? current
              : { status: "error", code: String(payload?.error ?? "collections_command_failed"), message: String(payload?.message ?? "") },
          );
          setLastAction(`${describe} failed: ${payload?.message ?? payload?.error ?? "unknown error"}`);
          return;
        }

        setState({ status: "ready", snapshot: payload.snapshot });
        setLastAction(`${describe} succeeded.`);
      } catch {
        if (requestGeneration !== generation.current) return;
        setState({ status: "error", code: "network_error", message: "The request could not be completed." });
      } finally {
        if (requestGeneration === generation.current) setBusy(false);
      }
    },
    [account, endpoint, network],
  );

  useEffect(() => {
    let cancelled = false;

    // Deferred by a microtask rather than called in the effect body: `send`
    // sets loading state before it awaits, and a synchronous setState here
    // would cascade a render. The cancel flag stops a remount — a wallet or
    // network change — from issuing a load for the session it replaced.
    void Promise.resolve().then(() => {
      if (!cancelled) void send({ action: "snapshot" }, "Loading collections");
    });

    return () => {
      cancelled = true;
    };
  }, [send]);

  const snapshot = state.status === "ready" ? state.snapshot : null;
  const selected = snapshot?.collections.find((collection) => collection.id === selectedId) ?? snapshot?.collections[0] ?? null;
  const membershipsInSelected = snapshot && selected
    ? snapshot.memberships.filter((membership) => membership.collectionId === selected.id)
    : [];

  const move = (membershipId: string, direction: -1 | 1) => {
    if (!selected) return;

    const ordered = membershipsInSelected.map((membership) => membership.id);
    const index = ordered.indexOf(membershipId);
    const target = index + direction;

    if (index < 0 || target < 0 || target >= ordered.length) return;

    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

    void send({ action: "reorder_memberships", reorder: { collectionId: selected.id, orderedMembershipIds: ordered } }, "Reordering");
  };

  return (
    <div className="flex flex-col gap-6">
      <LiveRegion message={lastAction} />

      {state.status === "loading" ? (
        <p data-testid="collections-loading" className="text-sm text-white/54">
          Loading collections…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div data-testid="collections-error" role="alert" className="glass-panel rounded-[28px] p-5 text-sm text-red-200">
          <p className="font-semibold">Collections could not be loaded.</p>
          <p className="mt-1 text-white/70">{state.message}</p>
          <p className="mt-2 text-xs text-white/42">Error code: {state.code}</p>
        </div>
      ) : null}

      {snapshot ? (
        <>
          <section data-testid="collections-summary" aria-labelledby="collections-summary-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="collections-summary-heading" className="text-xl font-semibold">
                Collections
              </h2>
              <StatusBadge tone={snapshot.coverage.state === "partial" ? "warning" : "neutral"}>
                {snapshot.coverage.state}
              </StatusBadge>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/70">{snapshot.coverage.note}</p>
            <p className="mt-2 text-xs text-white/42">
              Collections group assets you already watch. Deleting a collection removes the grouping, never the watched asset.
            </p>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
            <section aria-labelledby="collections-list-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
              <h2 id="collections-list-heading" className="text-lg font-semibold">
                Your collections
              </h2>

              <form
                aria-label="Create collection"
                className="mt-4 flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();

                  if (newCollectionName.trim().length === 0) return;

                  void send({ action: "create_collection", collection: { name: newCollectionName.trim() } }, "Creating collection");
                  setNewCollectionName("");
                }}
              >
                <label htmlFor={newCollectionId} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
                  New collection
                </label>
                <input
                  id={newCollectionId}
                  name="name"
                  value={newCollectionName}
                  autoComplete="off"
                  onChange={(event) => setNewCollectionName(event.target.value)}
                  className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-2xl border border-white/14 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/16 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50"
                >
                  Create
                </button>
              </form>

              <div className="mt-5">
                <CollectionSidebar
                  collections={snapshot.collections}
                  memberships={snapshot.memberships}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelectedId}
                  onDelete={(id) => void send({ action: "delete_collection", collectionId: id }, "Deleting collection")}
                />
              </div>
            </section>

            <section aria-labelledby="collection-contents-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
              <h2 id="collection-contents-heading" className="text-lg font-semibold">
                {selected ? selected.name : "No collection selected"}
              </h2>

              {selected ? (
                <>
                  <form
                    aria-label="Add asset"
                    className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
                    onSubmit={(event) => {
                      event.preventDefault();

                      if (!entryToAdd) return;

                      void send(
                        { action: "add_membership", membership: { collectionId: selected.id, watchlistEntryId: entryToAdd } },
                        "Adding asset",
                      );
                    }}
                  >
                    <div className="flex flex-1 flex-col gap-1.5">
                      <label htmlFor={addEntryId} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
                        Add a watched asset
                      </label>
                      <select
                        id={addEntryId}
                        name="watchlistEntryId"
                        value={entryToAdd}
                        onChange={(event) => setEntryToAdd(event.target.value)}
                        className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40"
                      >
                        {availableEntryIds.length === 0 ? <option value="">Nothing is watched yet</option> : null}
                        {availableEntryIds.map((id) => (
                          <option key={id} value={id} className="bg-[#151515]">
                            {id}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={busy || availableEntryIds.length === 0}
                      className="rounded-2xl border border-white/14 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/16 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </form>

                  <div className="mt-5">
                    <MembershipTable
                      memberships={membershipsInSelected}
                      tags={snapshot.tags}
                      busy={busy}
                      onMove={move}
                      onRemove={(id) => void send({ action: "remove_membership", membershipId: id }, "Removing asset")}
                    />
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-white/54">Create a collection to start grouping the assets you watch.</p>
              )}
            </section>
          </div>

          <section aria-labelledby="collections-tags-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <h2 id="collections-tags-heading" className="text-lg font-semibold">
              Tags
            </h2>
            <div className="mt-4">
              <TagEditor
                tags={snapshot.tags}
                busy={busy}
                onCreate={(label) => void send({ action: "create_tag", tag: { label } }, "Creating tag")}
                onDelete={(id) => void send({ action: "delete_tag", tagId: id }, "Deleting tag")}
              />
            </div>
          </section>

          <section aria-labelledby="collections-views-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <h2 id="collections-views-heading" className="text-lg font-semibold">
              Saved views
            </h2>
            <div className="mt-4">
              <SavedViewEditor
                views={snapshot.savedViews}
                collections={snapshot.collections}
                tags={snapshot.tags}
                busy={busy}
                onSave={(view) =>
                  void send(
                    { action: "save_view", view: { name: view.name, collectionIds: view.collectionIds, tagIds: view.tagIds, sort: "manual" } },
                    "Saving view",
                  )
                }
                onDelete={(id) => void send({ action: "delete_view", viewId: id }, "Deleting view")}
              />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
