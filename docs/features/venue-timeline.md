# Venue timeline

Read-only timeline of where a token is and was tradable.

## Coverage

- Venues are configured adapters. They are matched by chain id and contract address, never by ticker alone.
- An unreachable venue is unknown. Missing data is not treated as still listed.
- Repeated snapshots show transitions in time order.
- Trading, price aggregation, and a full exchange directory are out of scope.
