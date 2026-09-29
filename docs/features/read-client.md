# Read client compatibility

Baseline: `d41a5ebeea2e4d671e2e0d4e89e20ddcb8020e86`. Only existing GET handlers
are supported. The package is private; it is not published to npm.

| Method | Handler path after `/api` | Preserved response shape |
| --- | --- | --- |
| `health.get()` | `/health` | health object |
| `portfolio.get({ walletAddress, chain })` | `/portfolio` | portfolio object, nullable prices and data warnings |
| `history.transactions({ walletAddress?, cursor?, limit? })` | `/history/transactions` | `{ items, total, nextCursor? }` |
| `watchlist.list({ walletAddress? })` | `/watchlist` | `{ entries }`; current wallet-session cookie is authoritative |
| `alerts.list({ walletAddress })` | `/alerts` | `{ alerts }` (discovery alerts) |
| `registry.history({ network? })` | `/stellar/registry/history` | `{ ok, count, records }` |
| `registry.find({ network, txHash })` | `/stellar/registry/history` | `{ ok, record: object or null }` |
| `registry.status({ network, hash })` | `/stellar/registry/status` | transaction status including provider metadata |
| `snapshots.get(id)` | `/snapshots/[id]` | `{ snapshot }`, public redacted document |

All other endpoints, downloads, mutations, scanning, x402 payment, signing,
automatic pagination and session creation are unsupported. There is no GET on
`/snapshots`; use a known snapshot ID. No generic arbitrary-path method is exported.

The current OpenAPI v1 describes history as an array, while the current handler
and `listTransactionRecordsPaginated` return a page object. Registry history and
snapshot retrieval are absent from the document. This package follows the current
handlers and records these discrepancies without changing server routes or the
shared OpenAPI contract. Existing API compatibility policy still applies.

Fixture provenance: `packages/read-client/tests/fixtures` contains deterministic,
synthetic examples transcribed from the baseline handlers and their server types:
`server/types.ts`, `server/stellar/riskHistory.ts`, `server/snapshots/schema.ts`, and
`server/storage/index.ts:listTransactionRecordsPaginated`. No production wallet
data was captured. Health uses the documented minimal public fields; nested
operational metadata remains unknown. Unknown additive fields survive unchanged.
These fixtures assert wire compatibility, not provider correctness or financial
accuracy. Portfolio unavailable prices, empty lists, absent cursor, missing
registry record, structured/legacy errors and version mismatch are distinct cases.

Validation from the package directory:

```sh
npm ci
npm test
npm run build
```

The test suite calls every client method with mocked fetch, rejects malformed
nested records, checks credentials/cancellation/Retry-After and runs a browser
bundle without Node globals. Both consumption examples type-check. Tests make no
blockchain requests and require no paid credentials. The dedicated workflow runs
independently of the frontend installation and unrelated baseline build failures.

Compatibility: additive untyped fields are retained; removals/type changes of
typed fields produce `CompatibilityError`. Status/code strings are open-ended,
consistent with the server policy. New public snapshot document versions require
an explicit client update. Error messages do not retain request URLs or payloads.
