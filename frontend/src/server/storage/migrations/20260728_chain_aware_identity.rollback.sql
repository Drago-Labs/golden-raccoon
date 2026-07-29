-- Roll back issue #21 only when the legacy global uniqueness constraints can
-- be restored without deleting or merging records. This script deliberately
-- aborts instead of guessing which network-scoped row should survive.

begin;

do $rollback$
begin
  if exists (
    select 1
    from transactions
    group by tx_hash
    having count(*) > 1
  ) then
    raise exception 'rollback blocked: transaction hashes collide across chain/network scopes';
  end if;

  if exists (
    select 1
    from wallets
    group by address
    having count(*) > 1
  ) then
    raise exception 'rollback blocked: wallet addresses collide across chain/network scopes';
  end if;

  if exists (
    select 1
    from token_identities
    group by identity_key
    having count(*) > 1
  ) then
    raise exception 'rollback blocked: token identity keys collide across chain/network scopes';
  end if;

  if exists (
    select 1
    from user_rules
    group by wallet_address
    having count(*) > 1
  ) then
    raise exception 'rollback blocked: user rules collide across chain/network scopes';
  end if;
end
$rollback$;

drop view if exists chain_identity_migration_report;

drop index if exists token_identities_chain_network_asset_uidx;
drop index if exists token_identities_chain_network_identity_uidx;
drop index if exists transactions_chain_network_hash_uidx;
drop index if exists wallets_chain_network_address_uidx;
drop index if exists user_rules_chain_network_wallet_uidx;

alter table token_identities drop constraint if exists token_identities_chain_asset_check;
alter table transactions drop constraint if exists transactions_chain_hash_check;
alter table wallets drop constraint if exists wallets_chain_identity_check;
alter table agent_runs drop constraint if exists agent_runs_chain_family_check;
alter table agent_results drop constraint if exists agent_results_chain_family_check;
alter table recommendations drop constraint if exists recommendations_chain_family_check;
alter table approvals drop constraint if exists approvals_chain_family_check;
alter table approvals drop constraint if exists approvals_chain_hash_check;
alter table x402_payment_receipts drop constraint if exists x402_payment_receipts_chain_family_check;
alter table user_rules drop constraint if exists user_rules_chain_family_check;

do $legacy_constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'wallets_address_key') then
    alter table wallets add constraint wallets_address_key unique (address);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_tx_hash_key') then
    alter table transactions add constraint transactions_tx_hash_key unique (tx_hash);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'token_identities_identity_key_key') then
    alter table token_identities add constraint token_identities_identity_key_key unique (identity_key);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_rules_wallet_address_key') then
    alter table user_rules add constraint user_rules_wallet_address_key unique (wallet_address);
  end if;
end
$legacy_constraints$;

alter table wallets drop column if exists address_kind;
alter table wallets drop column if exists network;
alter table wallets drop column if exists chain_family;

alter table token_identities drop column if exists issuer;
alter table token_identities drop column if exists asset_key;
alter table token_identities drop column if exists asset_kind;
alter table token_identities drop column if exists network;
alter table token_identities drop column if exists chain_family;

alter table agent_runs drop column if exists network;
alter table agent_runs drop column if exists chain_family;
alter table agent_results drop column if exists network;
alter table agent_results drop column if exists chain_family;
alter table recommendations drop column if exists network;
alter table recommendations drop column if exists chain_family;
alter table approvals drop column if exists chain_family;
alter table transactions drop column if exists chain_family;
alter table x402_payment_receipts drop column if exists chain_family;
alter table user_rules drop column if exists network;
alter table user_rules drop column if exists chain_family;

commit;
