# POST /api/insights/privileged-keys

Request body:

```json
{
  "projectId": "multisig-project",
  "deployments": [{ "chain": "evm", "address": "0xvault", "name": "Vault" }],
  "privileges": [{ "contract": "0xvault", "chain": "evm", "role": "owner", "controller": "0xsafe", "threshold": 2, "signers": ["0xa", "0xb"] }]
}
```

`chain` is `evm` or `soroban`.

Responses:

- `{ "kind": "ready", "report": { "projectId", "controllers", "contracts", "coverage", "summary" } }`
- `{ "kind": "unavailable", "reason": string }` when `unavailable` is true
- `{ "kind": "unknown_format", "reason": string }` when the body cannot be read
- `400` when the body is not JSON
- `413` when the body exceeds `maxRequestBytes`

`Cache-Control` is `no-store`.
