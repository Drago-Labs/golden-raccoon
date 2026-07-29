-- Run after the migration. The first SELECT is the operator-facing report;
-- the DO block fails closed when any row remains unresolved.

select check_name, invalid_count
from chain_identity_migration_report
order by check_name;

do $validation$
declare
  failure record;
begin
  select check_name, invalid_count
  into failure
  from chain_identity_migration_report
  where invalid_count > 0
  order by check_name
  limit 1;

  if found then
    raise exception 'chain identity validation failed: % has % invalid rows',
      failure.check_name,
      failure.invalid_count;
  end if;
end
$validation$;

alter table token_identities alter column asset_kind set not null;
alter table token_identities alter column asset_key set not null;

alter table wallets validate constraint wallets_chain_identity_check;
alter table transactions validate constraint transactions_chain_hash_check;
alter table token_identities validate constraint token_identities_chain_asset_check;
alter table agent_runs validate constraint agent_runs_chain_family_check;
alter table agent_results validate constraint agent_results_chain_family_check;
alter table recommendations validate constraint recommendations_chain_family_check;
alter table approvals validate constraint approvals_chain_family_check;
alter table approvals validate constraint approvals_chain_hash_check;
alter table x402_payment_receipts validate constraint x402_payment_receipts_chain_family_check;
alter table user_rules validate constraint user_rules_chain_family_check;
