# Counterparty flows

This page profiles who a Stellar account pays and is paid by over a bounded window.

## Aggregation rules

- Sources in scope: classic `payment` operations, `path_payment_strict_send` / `path_payment_strict_receive`, and claimable-balance claim operations that name a recorded sponsor or peer.
- Direction is relative to the profiled account: credits are `in`, debits are `out`.
- Asset identity is `native` or `CODE:ISSUER`. Path-payment inflows use the destination asset; outflows use the source asset.
- Amounts are converted to stroops (10^-7), summed as integers, and formatted back to seven decimal places. IEEE floats are not used for totals or concentration.
- Totals are keyed by `(direction, asset, counterparty)`. Duplicate operation ids across readers are ignored once.

## Labels

Counterparties are labelled only when the identity directory / resolver returns a known entry. An unlisted account stays unlabelled. The feature does not invent exchange, issuer, or intermediary names.

## Concentration

For each `(direction, asset)` group, top-N share and Herfindahl (`Σ y_i² / (Σ y_i)²`) are computed from the positive counterparty totals. Empty groups are reported as undefined rather than zero.

## Coverage

Truncated Horizon pages, a window start that was not reached, or a failed reader make the report `partial`. When every reader is unavailable the report is `unavailable` and no volumes are invented.

Out of scope: risk scoring, price conversion, and identity attribution beyond the existing resolver directory.
