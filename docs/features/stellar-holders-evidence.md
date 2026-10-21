# Stellar holder distribution: sources and limits

## Sources

All figures come from Horizon for the selected network, plus the issuer's stellar.toml when it can be fetched. The read uses the configured data API for `stellar-testnet` or `stellar-pubnet` and does not mix hosts across those networks.

| Observation | Horizon request | Fields used |
| --- | --- | --- |
| Ledger | `GET /ledgers?order=desc&limit=1` | `sequence`, `closed_at` |
| Issued supply | `GET /assets?asset_code&asset_issuer` | `amount`, balance buckets, `liquidity_pools_amount`, `claimable_balances_amount`, `contracts_amount`, `num_accounts` |
| Trustline holders | `GET /accounts?asset=CODE:ISSUER` | `account_id` and the balance whose code and issuer both match |
| Liquidity pools | `GET /liquidity_pools?reserves=CODE:ISSUER` | pool `id` and the reserve `amount` for this asset |
| Claimable balances | `GET /claimable_balances?asset=CODE:ISSUER` | `id` and `amount` |
| Home domain | `GET /accounts/{issuer}` | `home_domain` |
| Distribution accounts | `GET https://{home_domain}/.well-known/stellar.toml` | matching `[[CURRENCIES]]` only |

The asset record is matched on code and issuer together. A balance for the same code and a different issuer is ignored. An asset record that is missing `amount` fails the read. Older servers that omit `contracts_amount` are treated as zero contract supply and the coverage note does not invent a contract balance.

## What the fraction means

`num_accounts` on the asset record can be larger than the number of holders returned. That is expected under the page cap, and it is also how a partial recording looks: the pages that were returned are summed, and the fraction uses issued `amount` as the denominator, not the count of rows.

Claimable balances and pool reserves are in the covered sum. They are not holders. Contract balances are in the denominator only.

## Sampling limits

| Limit | Value |
| --- | --- |
| Page size | 200 (Horizon's page cap) |
| Pages per walk | 5 |
| Holders retained | 1,000 |
| Pools retained | 200 |
| Claimable balances retained | 200 |
| HTTP timeout | 8 seconds |
| Request body | 16,384 bytes |
| stellar.toml body | 100,000 bytes |
| Top-N | 1, 5, and 10, plus a requested N up to 50 |

A walk that hits a cap, repeats a cursor, or sees the same account twice is partial. A toml host of `localhost` or a non-hostname home domain is not fetched.

## What this does not claim

It does not identify who controls an account, recommend a trade, or change a risk score. It does not estimate holders it did not read. A missing provider is `unavailable`. Fixture tests inject a reader and do not call Horizon; the recorded responses live in `frontend/tests/features/stellar-holders/data/`.
