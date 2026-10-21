# Quorum map API

`POST /api/insights/quorum-map`

Request JSON:

- `network`: `stellar-testnet` or `stellar-pubnet`.

Responses:

- `200` with `{ report }` when the directory was read. `report.state` is `complete` or `partial`.
- `503` with `{ report }` when the directory is unavailable. `report.organizations` is empty. `Retry-After: 15`.
- `400` for invalid JSON or an invalid network.
- `413` when the declared body or a provider body exceeds its limit.

Every response sets `cache-control: no-store`.

`report.provesSafety` is always false. `report.coverageNotice` states that the result does not prove quorum intersection or network safety. `report.organizations[].topLevelCount` is how many top-level quorum sets name that organization. `report.organizations[].removalBreaks` is how many of those sets fall below their threshold if the organization is removed. `report.unresolvedKeys` lists validator keys that have no directory node. `report.sources[].ageSeconds` is the age of that fetch. `report.disagreements` lists toml and directory mismatches.
