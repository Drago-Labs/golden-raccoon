# Stellar holder distribution

## What it measures

An issued Stellar classic asset is not one balance. Supply sits in account trustlines, liquidity-pool reserves, and claimable balances, and the issuer's own circle is not the same thing as the public float. This feature reads one `CODE:ISSUER` on one network and reports that split.

The result key is `network|CODE|ISSUER`. Asset codes are case-sensitive, so `usd` and `USD` stay distinct. `testnet` and `stellar-testnet` are the same network. The same code from two issuers, or the same pair on testnet and pubnet, never share a report. The service does not cache a previous asset.

## Supply buckets

Three buckets are summed from the records this read actually saw:

| Bucket | Source |
| --- | --- |
| Account trustlines | Positive balances on paged `/accounts?asset=CODE:ISSUER` |
| Liquidity pools | This asset's reserve in each paged pool |
| Claimable balances | Each paged claimable balance for this asset |

A zero trustline is not a holder of supply and is left out of the table and the metrics. Pool and claimable amounts are never inserted into the holder list. Contract balances stay in the issued total and are named in the coverage note; they are not walked as holders.

## Concentration

Amounts are integers of 10^-7 of one token. Shares are reduced rationals.

Sorted ascending with 1-based ranks:

```
Gini = (2 * Σ i*y_i − (n+1) * Σ y_i) / (n * Σ y_i)
Herfindahl = Σ y_i^2 / (Σ y_i)^2
Top-N share = (sum of the N largest) / (sum of the group)
```

Two groups are reported:

- **All trustline accounts**, including the issuer and distribution accounts.
- **Public float**, which drops the issuer and distribution accounts.

The worked example in `concentrated-asset.json` is 50, 30, 15, and 5. Gini is 3/8 and Herfindahl is 73/200. After removing the 50 distribution balance, Gini is 1/3 and Herfindahl is 23/50.

## Issuer adjacency

The issuer account is always adjacent. Distribution accounts come from the matching `[[CURRENCIES]]` block in stellar.toml: `distribution_account` and `distribution_accounts`. A listing on a different code or issuer is ignored. SEP-1 `ACCOUNTS` is an organisational directory and is not treated as a distribution list. If the toml lists the issuer again as a distributor, the role stays `issuer`.

If stellar.toml cannot be read, the supply figures are still reported and the coverage note says distribution marking may be incomplete.

## Coverage

The covered fraction is

```
(trustlines seen + pool reserves seen + claimable balances seen) / issued supply
```

`issued` is the asset record's `amount` at the ledger named on the report. The fraction is partial when paging stops early or when the observed sum does not equal issued supply. A provider failure is `unavailable`, with fraction 0/0, and no concentration is invented.

## Paging bounds

One request reads at most 5 pages, 200 records per page, and 1,000 holders. Pool and claimable walks use the same page cap. Each Horizon call times out at 8 seconds. A repeated cursor or a repeated account stops the walk and marks the report partial. See `docs/features/stellar-holders-evidence.md` for sources and `docs/features/stellar-holders-api.md` for the route.
