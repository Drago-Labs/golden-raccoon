-- Issue #232: wallet-scoped watchlist collections, tags and saved views.
--
-- Additive only. No existing table is altered and no existing row is touched:
-- this migration introduces metadata *beside* the watchlist, and the canonical
-- asset identity stays in watchlist_entries where it already lives.
--
-- Safe to run repeatedly.

begin;

create table if not exists watchlist_collections (
  id text primary key,
  wallet_address text not null,
  network text not null,
  name text not null,
  description text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1
);

-- Every lookup in this feature is (wallet, network) scoped, so that pair leads
-- every index. An id-only index would invite an id-only query.
create index if not exists watchlist_collections_owner_idx
  on watchlist_collections (wallet_address, network, position);

create table if not exists watchlist_collection_tags (
  id text primary key,
  wallet_address text not null,
  network text not null,
  label text not null,
  normalized text not null,
  created_at timestamptz not null default now()
);

-- Uniqueness is on the normalized label, per owner: "DeFi" and "defi" are one
-- tag for one wallet on one network, and two different wallets may both have a
-- tag called "defi".
create unique index if not exists watchlist_collection_tags_owner_normalized_idx
  on watchlist_collection_tags (wallet_address, network, normalized);

create table if not exists watchlist_collection_memberships (
  id text primary key,
  wallet_address text not null,
  network text not null,
  collection_id text not null,
  watchlist_entry_id text not null,
  position integer not null default 0,
  tag_ids text[] not null default '{}',
  added_at timestamptz not null default now()
);

-- One watchlist entry appears in one collection at most once. The database
-- enforces it as well as the service, so a race between two requests cannot
-- produce the duplicate the service is careful to avoid.
create unique index if not exists watchlist_collection_memberships_unique_idx
  on watchlist_collection_memberships (wallet_address, network, collection_id, watchlist_entry_id);

create index if not exists watchlist_collection_memberships_collection_idx
  on watchlist_collection_memberships (wallet_address, network, collection_id, position);

create table if not exists watchlist_saved_views (
  id text primary key,
  wallet_address text not null,
  network text not null,
  name text not null,
  collection_ids text[] not null default '{}',
  tag_ids text[] not null default '{}',
  search text,
  sort text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1
);

create index if not exists watchlist_saved_views_owner_idx
  on watchlist_saved_views (wallet_address, network, name);

-- Deliberately no foreign key from memberships to watchlist_entries.
--
-- A membership whose entry has been removed is reported to the user as a
-- missing reference rather than deleted, so they can see that something they
-- were tracking has gone. A cascading delete would make that gap invisible.

commit;
