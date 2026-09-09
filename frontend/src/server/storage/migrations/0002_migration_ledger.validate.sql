-- Validation for 0002_migration_ledger
do $validate_ledger$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'migration_ledger'
  ) then
    raise exception '0002_migration_ledger validation failed: migration_ledger table does not exist';
  end if;
end
$validate_ledger$;
