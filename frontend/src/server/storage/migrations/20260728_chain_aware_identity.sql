-- Issue #21: chain-aware identity backfill.
-- Safe to run repeatedly. Existing EVM values are preserved byte-for-byte;
-- only new discriminator/network columns and deterministic asset keys are added.

begin;

alter table wallets add column if not exists chain_family text;
alter table wallets add column if not exists network text;
alter table wallets add column if not exists address_kind text;

alter table token_identities add column if not exists chain_family text;
alter table token_identities add column if not exists network text;
alter table token_identities add column if not exists asset_kind text;
alter table token_identities add column if not exists asset_key text;
alter table token_identities add column if not exists issuer text;

alter table agent_runs add column if not exists chain_family text;
alter table agent_runs add column if not exists network text;
alter table agent_results add column if not exists chain_family text;
alter table agent_results add column if not exists network text;
alter table recommendations add column if not exists chain_family text;
alter table recommendations add column if not exists network text;
alter table approvals add column if not exists chain_family text;
alter table transactions add column if not exists chain_family text;
alter table x402_payment_receipts add column if not exists chain_family text;
alter table user_rules add column if not exists chain_family text;
alter table user_rules add column if not exists network text;

update wallets
set
  chain_family = case
    when address ~ '^[GM][A-Z2-7]{55}$' then 'stellar'
    else 'evm'
  end,
  network = case
    when address ~ '^[GM][A-Z2-7]{55}$' then coalesce(nullif(network, ''), 'stellar-testnet')
    else coalesce(nullif(network, ''), 'legacy-evm')
  end,
  address_kind = case
    when address ~ '^G[A-Z2-7]{55}$' then 'stellar_account'
    else 'evm_account'
  end
where chain_family is null or network is null or address_kind is null;

update token_identities
set
  chain_family = case
    when lower(coalesce(chain, '')) like 'stellar%' or contract_address ~ '^C[A-Z2-7]{55}$'
      then 'stellar'
    else 'evm'
  end,
  network = case
    when lower(coalesce(chain, '')) in ('stellar-pubnet', 'stellar:pubnet', 'stellar-mainnet', 'pubnet')
      then 'stellar-pubnet'
    when lower(coalesce(chain, '')) like 'stellar%' or contract_address ~ '^C[A-Z2-7]{55}$'
      then 'stellar-testnet'
    else coalesce(nullif(lower(chain), ''), 'legacy-evm')
  end
where chain_family is null or network is null;

-- Do not infer an issuer from a symbol. Classic identities are backfilled only
-- when the existing identity_key already contains CODE:G... provenance.
update token_identities
set
  asset_kind = case
    when chain_family = 'evm' then 'evm_contract'
    when identity_key = 'native' or identity_key like '%:native' then 'stellar_native'
    when identity_key ~ '^classic:[A-Za-z0-9]{1,12}:G[A-Z2-7]{55}$' then 'stellar_classic'
    when identity_key ~ '^sac:C[A-Z2-7]{55}$' then 'stellar_sac'
    when identity_key ~ '^sep41:C[A-Z2-7]{55}$' then 'stellar_sep41'
    when contract_address ~ '^C[A-Z2-7]{55}$' then 'stellar_sep41'
    else null
  end,
  asset_key = case
    when chain_family = 'evm' and contract_address ~* '^0x[0-9a-f]{40}$'
      then 'contract:' || lower(contract_address)
    when identity_key = 'native' or identity_key like '%:native' then 'native'
    when identity_key ~ '^classic:[A-Za-z0-9]{1,12}:G[A-Z2-7]{55}$'
      then 'classic:' || upper(split_part(identity_key, ':', 2)) || ':' || split_part(identity_key, ':', 3)
    when identity_key ~ '^(sac|sep41):C[A-Z2-7]{55}$' then identity_key
    when contract_address ~ '^C[A-Z2-7]{55}$' then 'sep41:' || contract_address
    else null
  end,
  issuer = case
    when identity_key ~ '^classic:[A-Za-z0-9]{1,12}:G[A-Z2-7]{55}$'
      then split_part(identity_key, ':', 3)
    else issuer
  end
where asset_kind is null or asset_key is null;

update agent_runs
set
  chain_family = case
    when wallet_address ~ '^[GM][A-Z2-7]{55}$' or lower(coalesce(target_chain, '')) like 'stellar%'
      then 'stellar'
    else 'evm'
  end,
  network = case
    when lower(coalesce(target_chain, '')) in ('stellar-pubnet', 'stellar:pubnet', 'stellar-mainnet', 'pubnet')
      then 'stellar-pubnet'
    when wallet_address ~ '^[GM][A-Z2-7]{55}$' or lower(coalesce(target_chain, '')) like 'stellar%'
      then 'stellar-testnet'
    else coalesce(nullif(lower(target_chain), ''), 'legacy-evm')
  end
where chain_family is null or network is null;

update agent_results result
set chain_family = run.chain_family, network = run.network
from agent_runs run
where result.run_id = run.id and (result.chain_family is null or result.network is null);

update recommendations recommendation
set chain_family = run.chain_family, network = run.network
from agent_runs run
where recommendation.run_id = run.id
  and (recommendation.chain_family is null or recommendation.network is null);

update recommendations
set
  chain_family = case when wallet_address ~ '^[GM][A-Z2-7]{55}$' then 'stellar' else 'evm' end,
  network = case when wallet_address ~ '^[GM][A-Z2-7]{55}$' then 'stellar-testnet' else 'legacy-evm' end
where chain_family is null or network is null;

update approvals
set
  chain_family = case
    when tx_hash ~ '^0x[0-9A-Fa-f]{64}$' then 'evm'
    when tx_hash ~ '^[0-9A-Fa-f]{64}$' then 'stellar'
    else case when wallet_address ~ '^[GM][A-Z2-7]{55}$' then 'stellar' else 'evm' end
  end,
  network = case
    when tx_hash !~ '^0x' and tx_hash ~ '^[0-9A-Fa-f]{64}$'
      then coalesce(nullif(network, ''), 'stellar-testnet')
    else coalesce(nullif(lower(network), ''), 'legacy-evm')
  end
where chain_family is null or network is null;

update transactions
set chain_family = case
  when tx_hash ~ '^0x[0-9A-Fa-f]{64}$' then 'evm'
  when tx_hash ~ '^[0-9A-Fa-f]{64}$' then 'stellar'
  else case when wallet_address ~ '^[GM][A-Z2-7]{55}$' then 'stellar' else 'evm' end
end
where chain_family is null;

update x402_payment_receipts
set chain_family = case
  when transaction_hash ~ '^[0-9A-Fa-f]{64}$' and transaction_hash !~ '^0x' then 'stellar'
  when lower(network) like 'stellar%' then 'stellar'
  else 'evm'
end
where chain_family is null;

update user_rules
set
  chain_family = case when wallet_address ~ '^[GM][A-Z2-7]{55}$' then 'stellar' else 'evm' end,
  network = case when wallet_address ~ '^[GM][A-Z2-7]{55}$' then 'stellar-testnet' else 'legacy-evm' end
where chain_family is null or network is null;

alter table wallets alter column chain_family set default 'evm';
alter table wallets alter column network set default 'legacy-evm';
alter table wallets alter column address_kind set default 'evm_account';
alter table token_identities alter column chain_family set default 'evm';
alter table token_identities alter column network set default 'legacy-evm';
alter table agent_runs alter column chain_family set default 'evm';
alter table agent_runs alter column network set default 'legacy-evm';
alter table agent_results alter column chain_family set default 'evm';
alter table agent_results alter column network set default 'legacy-evm';
alter table recommendations alter column chain_family set default 'evm';
alter table recommendations alter column network set default 'legacy-evm';
alter table approvals alter column chain_family set default 'evm';
alter table approvals alter column network set default 'legacy-evm';
alter table transactions alter column chain_family set default 'evm';
alter table x402_payment_receipts alter column chain_family set default 'evm';
alter table user_rules alter column chain_family set default 'evm';
alter table user_rules alter column network set default 'legacy-evm';

alter table wallets alter column chain_family set not null;
alter table wallets alter column network set not null;
alter table wallets alter column address_kind set not null;
alter table token_identities alter column chain_family set not null;
alter table token_identities alter column network set not null;
alter table agent_runs alter column chain_family set not null;
alter table agent_runs alter column network set not null;
alter table agent_results alter column chain_family set not null;
alter table agent_results alter column network set not null;
alter table recommendations alter column chain_family set not null;
alter table recommendations alter column network set not null;
alter table approvals alter column chain_family set not null;
alter table approvals alter column network set not null;
alter table transactions alter column chain_family set not null;
alter table x402_payment_receipts alter column chain_family set not null;
alter table user_rules alter column chain_family set not null;
alter table user_rules alter column network set not null;

alter table wallets drop constraint if exists wallets_address_key;
alter table token_identities drop constraint if exists token_identities_identity_key_key;
alter table transactions drop constraint if exists transactions_tx_hash_key;
alter table user_rules drop constraint if exists user_rules_wallet_address_key;

create unique index if not exists wallets_chain_network_address_uidx
  on wallets(chain_family, network, address);
create unique index if not exists token_identities_chain_network_asset_uidx
  on token_identities(chain_family, network, asset_key)
  where asset_key is not null;
create unique index if not exists token_identities_chain_network_identity_uidx
  on token_identities(chain_family, network, identity_key);
create unique index if not exists transactions_chain_network_hash_uidx
  on transactions(chain_family, network, tx_hash);
create unique index if not exists user_rules_chain_network_wallet_uidx
  on user_rules(chain_family, network, wallet_address);

do $migration$
begin
  if not exists (select 1 from pg_constraint where conname = 'wallets_chain_identity_check') then
    alter table wallets add constraint wallets_chain_identity_check check (
      (chain_family = 'evm' and address_kind = 'evm_account' and address ~* '^0x[0-9a-f]{40}$')
      or
      (chain_family = 'stellar' and address_kind = 'stellar_account' and address ~ '^G[A-Z2-7]{55}$')
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_chain_hash_check') then
    alter table transactions add constraint transactions_chain_hash_check check (
      (chain_family = 'evm' and tx_hash ~ '^0x[0-9a-f]{64}$')
      or
      (chain_family = 'stellar' and tx_hash ~ '^[0-9A-Fa-f]{64}$')
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'token_identities_chain_asset_check') then
    alter table token_identities add constraint token_identities_chain_asset_check check (
      (chain_family = 'evm' and asset_kind = 'evm_contract' and asset_key ~ '^contract:0x[0-9a-f]{40}$')
      or
      (chain_family = 'stellar' and (
        (asset_kind = 'stellar_native' and asset_key = 'native')
        or (asset_kind = 'stellar_classic' and asset_key ~ '^classic:[A-Z0-9]{1,12}:G[A-Z2-7]{55}$' and issuer ~ '^G[A-Z2-7]{55}$')
        or (asset_kind = 'stellar_sac' and asset_key ~ '^sac:C[A-Z2-7]{55}$')
        or (asset_kind = 'stellar_sep41' and asset_key ~ '^sep41:C[A-Z2-7]{55}$')
      ))
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agent_runs_chain_family_check') then
    alter table agent_runs add constraint agent_runs_chain_family_check
      check (chain_family in ('evm', 'stellar')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agent_results_chain_family_check') then
    alter table agent_results add constraint agent_results_chain_family_check
      check (chain_family in ('evm', 'stellar')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recommendations_chain_family_check') then
    alter table recommendations add constraint recommendations_chain_family_check
      check (chain_family in ('evm', 'stellar')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'approvals_chain_family_check') then
    alter table approvals add constraint approvals_chain_family_check
      check (chain_family in ('evm', 'stellar')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'approvals_chain_hash_check') then
    alter table approvals add constraint approvals_chain_hash_check check (
      (chain_family = 'evm' and tx_hash ~ '^0x[0-9a-f]{64}$')
      or
      (chain_family = 'stellar' and tx_hash ~ '^[0-9A-Fa-f]{64}$')
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'x402_payment_receipts_chain_family_check') then
    alter table x402_payment_receipts add constraint x402_payment_receipts_chain_family_check
      check (chain_family in ('evm', 'stellar')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_rules_chain_family_check') then
    alter table user_rules add constraint user_rules_chain_family_check
      check (chain_family in ('evm', 'stellar')) not valid;
  end if;
end
$migration$;

create or replace view chain_identity_migration_report as
select 'wallets_invalid'::text as check_name, count(*)::bigint as invalid_count
from wallets
where not (
  (chain_family = 'evm' and address_kind = 'evm_account' and address ~* '^0x[0-9a-f]{40}$')
  or (chain_family = 'stellar' and address_kind = 'stellar_account' and address ~ '^G[A-Z2-7]{55}$')
)
union all
select 'assets_unresolved', count(*) from token_identities where asset_key is null or asset_kind is null
union all
select 'transactions_invalid', count(*) from transactions
where not (
  (chain_family = 'evm' and tx_hash ~ '^0x[0-9a-f]{64}$')
  or (chain_family = 'stellar' and tx_hash ~ '^[0-9A-Fa-f]{64}$')
)
union all
select 'duplicate_transactions', count(*) from (
  select chain_family, network, tx_hash
  from transactions
  group by chain_family, network, tx_hash
  having count(*) > 1
) duplicates;

commit;
