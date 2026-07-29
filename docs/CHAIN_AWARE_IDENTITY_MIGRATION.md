# Chain-aware identity migration

Issue #21 introduces an explicit `(chain_family, network)` scope for every
network-sensitive record. It preserves existing EVM address, network, asset,
and transaction values while removing global transaction and identity
uniqueness assumptions.

## Identity contract

- EVM account/contract addresses are validated as 20-byte `0x` identifiers and
  stored lowercase, matching the existing adapter behavior.
- Stellar wallets are G-address accounts. Soroban contracts are C-addresses;
  neither is lowercased.
- EVM transaction hashes are `0x` plus 64 hexadecimal characters and are stored
  lowercase. Stellar transaction hashes are 64 hexadecimal characters without
  `0x` and retain their supplied case.
- Transaction uniqueness is `(chain_family, network, tx_hash)`.
- Asset uniqueness is `(chain_family, network, asset_key)`.
- Native XLM is `native`; classic assets are
  `classic:CODE:G...`; SACs are `sac:C...`; SEP-41 tokens are `sep41:C...`;
  EVM contracts are `contract:0x...`.
- A symbol never supplies a missing Stellar issuer. Records without provenance
  remain unresolved in the validation report.

The TypeScript constructors and validators live in
`frontend/src/lib/chainIdentity.ts`. API routes accept optional
`chainFamily` for backward-compatible EVM requests, but validate any supplied
family/network/address/hash combination before storage.

## Apply and validate

Take a database snapshot before applying the migration. In the Supabase SQL
editor, `psql`, or the project migration runner:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f frontend/src/server/storage/migrations/20260728_chain_aware_identity.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f frontend/src/server/storage/migrations/20260728_chain_aware_identity.validate.sql
```

The migration is idempotent. It backfills the existing EVM rows as EVM without
rewriting their identifiers. Existing Stellar rows are classified only from
an explicit Stellar network, a valid G/C address, or an already provenance-rich
asset key.

The validation script prints `chain_identity_migration_report` and fails if
any invalid wallet/hash, unresolved asset, or duplicate scoped transaction
remains. Resolve every non-zero count before validating the constraints:

```sql
select * from chain_identity_migration_report order by check_name;
```

Typical recovery actions:

- `assets_unresolved`: obtain the original issuer or contract identity from the
  source record; never infer it from `symbol`.
- `transactions_invalid`: correct the recorded family/network from authoritative
  transaction provenance, then rerun validation.
- `wallets_invalid`: restore the original account identifier from the source
  system; do not uppercase/lowercase a damaged Stellar value.

## Representative verification

The repository test uses an embedded PostgreSQL-compatible PGlite database. It
creates production-shaped legacy EVM and Stellar rows, applies the migration
twice, runs the validation report, verifies every asset/address variant,
exercises scoped transaction uniqueness and invalid cross-family rejection,
and runs the rollback:

```sh
npm run test:chain-identity
```

## Rollback

Stop writes before rollback and retain the pre-migration snapshot. Then run:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f frontend/src/server/storage/migrations/20260728_chain_aware_identity.rollback.sql
```

Rollback is fail-safe and idempotent. It aborts if network-scoped transactions,
wallets, token identity keys, or user rules would collide under the former
global uniqueness rules. In that case, restore the snapshot or keep the new
schema; do not delete or merge records merely to force rollback. After a
successful rollback, deploy the previous application version and verify its
storage health before resuming writes.
