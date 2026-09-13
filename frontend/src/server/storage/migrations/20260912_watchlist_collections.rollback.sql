-- Roll back issue #232.
--
-- These four tables hold only collection metadata: names, tags, orderings and
-- saved filters. Dropping them removes a user's organisation of their
-- watchlist and nothing else — no watched asset, no scan history and no asset
-- identity lives here, so this rollback cannot lose tracked assets.
--
-- It is still destructive of user-authored metadata, so it is written to be
-- run deliberately rather than as part of an automatic downgrade.

begin;

drop index if exists watchlist_saved_views_owner_idx;
drop index if exists watchlist_collection_memberships_collection_idx;
drop index if exists watchlist_collection_memberships_unique_idx;
drop index if exists watchlist_collection_tags_owner_normalized_idx;
drop index if exists watchlist_collections_owner_idx;

drop table if exists watchlist_saved_views;
drop table if exists watchlist_collection_memberships;
drop table if exists watchlist_collection_tags;
drop table if exists watchlist_collections;

commit;
