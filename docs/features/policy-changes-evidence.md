# Policy change tracker — sources and limits

## Data sources

- The registered project's policy page (`server/research/policy-changes/projectRegistry.ts`), fetched directly over HTTP(S).
- No third-party API, database, or paid provider is used.

## Fetch safety

Every fetch (and every redirect hop) is checked against
`server/security/urlSafety.ts`'s `assertExternalFetchAllowed`, plus a DNS
resolution check so a hostname that resolves to a private address after the
safety check still gets blocked (DNS-rebinding protection). See
`server/research/policy-changes/fetcher.ts`.

| Bound | Value |
| --- | --- |
| Fetch timeout | 6,000 ms |
| Max redirects | 3 |
| Max page size | 1,000,000 bytes |
| Max extracted text kept | 200,000 characters |
| Max excerpt returned to the caller | 4,096 characters |
| Max prior snapshots accepted per request | 50 |
| Max diff rows per comparison | 200 |
| Max figure changes reported | 100 |

## What counts as a "figure"

A figure is any token matching an optional currency symbol, a number
(optionally with a decimal separator), and an optional percent sign — for
example `2%`, `$5`, `1,000`. Figure changes are only reported inside
sentence-level rows that the diff already marked as changed; this tool does
not scan unchanged text for numbers.

## History bound

Diffs for any pair older than the newest snapshot are computed from the
bounded excerpt (≤4,096 characters) the caller already holds, not from a
server-side copy of the full original page — this feature keeps no database.
The newest comparison (prior → current) always uses the full, freshly
extracted text (≤200,000 characters) on the "current" side.
