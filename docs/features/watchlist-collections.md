# Wallet-scoped watchlist collections, tags and saved views

## Why this exists

A flat watchlist stops being useful past a screenful. This adds the
organisation layer — collections, tags and saved filters — as metadata that
sits *beside* the watchlist rather than inside it.

## Two invariants

**1. Asset identity stays in one place.**

A membership holds a watchlist entry id and nothing else. This feature stores
no symbol, no contract address and no chain: it cannot drift away from the
canonical identity because it never copies it. The consequence users care
about: **deleting a collection removes the grouping, never the watched asset.**
`assetsUnchanged: true` is carried in every snapshot, and the conformance suite
asserts the entry is still watched after its collection is deleted.

**2. A record is addressable only through its owner.**

Every repository method takes an `OwnerScope` — wallet *and* network. That is
not a convention; it is the boundary. There is no method that can reach a
record without naming its owner, so "wallet A reads wallet B's collection" is
not an access-control bug waiting to happen, it is a call that cannot be
written. Every SQL statement filters on `wallet_address` and `network` in the
same `where` clause that matches the id.

An id the caller does not own produces **`not_found`, never `forbidden`** —
saying "forbidden" would confirm the id exists. A route test asserts the
response for a real id owned by someone else is byte-identical to the response
for an invented one.

The same address on two networks is two owners. A testnet collection cannot
appear on mainnet.

## Decisions worth knowing

| Situation | What happens | Why |
| --- | --- | --- |
| Adding the same entry to a collection twice | Returns the existing membership | It is what a double-click means, and it keeps "at most once per collection" true |
| `"DeFi"` and `"  defi  "` | One tag; the display label keeps the user's casing | Three tags that look identical and filter differently are worse than no tags |
| Deleting a tag | Detached from every membership that carried it; memberships survive | The tag was an annotation, not the thing |
| A watchlist entry disappears | The membership stays, flagged `referenceMissing`, coverage goes `partial` | A user should see the gap, not find the row silently gone |
| Deleting a collection a saved view names | The view is untouched; the id simply stops matching | Rewriting someone's saved view as a side effect is a surprise they did not ask for |
| A partial reorder | Refused with `incomplete_ordering` | Unnamed items would be left at positions that no longer mean anything |
| Two tabs editing one collection | Second write refused with `stale_revision` (409) | A silent merge loses one of them |

## Storage

Two implementations, one conformance suite. `conformance.test.ts` runs every
case against **both** the memory and the PostgreSQL repository, so they are
interchangeable rather than merely similar — an ordering, a duplicate rule or a
transaction boundary that diverges fails in CI.

Membership changes that touch more than one row run in a transaction: a
reorder either lands completely or not at all.

### Migration

`frontend/src/server/storage/migrations/20260912_watchlist_collections.sql`,
with `.rollback.sql` and `.validate.sql` beside it, following the layout the
`20260728_chain_aware_identity` set established.

It is **additive only**: four new tables, no existing table altered and no
existing row touched.

Two uniqueness indexes matter:

- `watchlist_collection_tags_owner_normalized_idx` — one normalized label per
  owner, so two wallets may both have a tag called "defi".
- `watchlist_collection_memberships_unique_idx` — one entry per collection, so
  a race between two requests cannot produce the duplicate the service is
  careful to avoid.

There is deliberately **no foreign key** from memberships to
`watchlist_entries`. A cascading delete would make the "no longer watched"
state invisible, which is the state the user most needs to see.

## Privacy hooks

- `exportCollectionMetadata(owner, deps)` returns exactly what the workspace
  shows, in the snapshot shape.
- `eraseCollectionMetadata(owner, repository)` removes every collection record
  for one wallet on one network and reports the counts.

Erasure is metadata-only by construction: it touches no watchlist entry, no
scan history and no asset identity. Tests pin that down, along with the cases
that matter — another wallet's metadata survives, the same wallet's metadata on
another network survives, and running it twice is safe.

## Layout

```
frontend/src/server/research/watchlist-collections/
  schema.ts             contract, limits, the not_found-not-forbidden rule
  ownership.ts          canonical owner; the boundary itself
  collections.ts        ordering, naming, revision freshness
  tags.ts               normalization
  membership.ts         duplicates, full reordering, missing references
  savedViews.ts         filters validated against the caller's own records
  repository.ts         the port both implementations satisfy
  memoryRepository.ts   default; copies on read and write
  postgresRepository.ts parameterized, owner-filtered, transactional
  service.ts            validated CRUD plus the privacy hooks
frontend/src/components/research/watchlist-collections/
  CollectionWorkspace.tsx  keyed by account and network; no optimistic copy
  CollectionSidebar.tsx    plain buttons, so the keyboard works for free
  TagEditor.tsx            states the normalization rule up front
  SavedViewEditor.tsx      offers only the caller's own ids
  MembershipTable.tsx      Move up / Move down, not drag and drop
frontend/tests/features/watchlist-collections/
  fakePool.ts              a statement-recognizing stand-in for a pg pool
```

Entry point: `frontend/src/components/WatchlistClient.tsx`.

The workspace keeps **no optimistic local copy**: every mutation round-trips
and re-reads the snapshot the server returns. A local copy that disagreed with
the server would be a second source of truth for who owns what.

## A note on `fakePool.ts`

It is not a SQL engine. It recognizes exactly the statements
`postgresRepository.ts` issues and applies them to in-memory tables, modelling
`BEGIN`/`COMMIT`/`ROLLBACK` with a real snapshot restore and both uniqueness
indexes. Its job is to let the conformance suite run in CI with no database.

What it cannot check is whether the SQL is *valid PostgreSQL*. That is what the
`migration` job in the feature workflow is for: it stands up a disposable
PostgreSQL 16, applies the migration, validates it, applies it again, rolls it
back, and confirms the watchlist table survived.

## Verification

```
cd frontend
npm run test:watchlist-collections   # or: npx vitest run tests/features/watchlist-collections
npx playwright test e2e/specs/watchlist-collections.spec.ts
```

The focused suite and the migration job both run on every pull request through
`.github/workflows/feature-watchlist-collections.yml`. No test needs a
database, funds, keys or paid services.
