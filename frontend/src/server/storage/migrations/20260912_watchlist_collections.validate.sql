-- Validation for issue #232, run after the forward migration.
--
-- Each check aborts with a message naming what is wrong, so a failed migration
-- says which invariant broke rather than leaving it to be discovered later.

do $validate$
begin
  if to_regclass('public.watchlist_collections') is null then
    raise exception 'watchlist_collections is missing after migration';
  end if;

  if to_regclass('public.watchlist_collection_tags') is null then
    raise exception 'watchlist_collection_tags is missing after migration';
  end if;

  if to_regclass('public.watchlist_collection_memberships') is null then
    raise exception 'watchlist_collection_memberships is missing after migration';
  end if;

  if to_regclass('public.watchlist_saved_views') is null then
    raise exception 'watchlist_saved_views is missing after migration';
  end if;

  if not exists (
    select 1 from pg_indexes
    where indexname = 'watchlist_collection_memberships_unique_idx'
  ) then
    raise exception 'the membership uniqueness index is missing; duplicates would be possible under a race';
  end if;

  if not exists (
    select 1 from pg_indexes
    where indexname = 'watchlist_collection_tags_owner_normalized_idx'
  ) then
    raise exception 'the tag uniqueness index is missing; two tags could normalize alike for one owner';
  end if;

  -- The watchlist itself must be untouched by this migration.
  if to_regclass('public.watchlist_entries') is null then
    raise exception 'watchlist_entries is missing; this migration must not have removed it';
  end if;
end
$validate$;
