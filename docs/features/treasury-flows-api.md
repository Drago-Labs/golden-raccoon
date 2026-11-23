# POST /api/insights/treasury-flows

Request: `{ "projectId", "addresses", "checkpoints", "outflows", "reported" }`.

`addresses[]` is `{ "chain", "address", "source" }`. `checkpoints[]` is `{ "time", "asset", "chain", "amount" }`. `outflows[]` adds `destination` and an optional `label`. `reported[]` is `{ "asset", "chain", "reported", "source" }`.

Ready response: `{ "kind": "ready", "report": { "projectId", "balances", "outflows", "comparisons", "coverage" } }`. `outflows[].kind` is `exchange`, `multisig`, `contract`, or `unknown`. `comparisons[].matches` is true only when the observed checkpoint equals the reported amount.

`400` invalid JSON. `413` over the byte ceiling. `Cache-Control: no-store`.
