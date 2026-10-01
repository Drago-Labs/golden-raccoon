# Wash volume

Heuristic, read-only view of how much reported volume survives each filter.

## Filters

- Same address. False positive: a router that is both maker and taker in a legitimate aggregation.
- Funded by the same source. The trade's funder field is the shared funding source. False positive: two independent traders funded by an exchange hot wallet.
- Back and forth within the window. False positive: two desks hedging the same inventory.
- Repeated round amounts. False positive: a market maker quoting the same size.

Filters are applied independently, so their order does not change the totals. Truncated history is labelled partial. Results are heuristic evidence, not an accusation of a named entity.
