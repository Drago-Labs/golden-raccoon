# Package provenance inspector — API

## `POST /api/insights/package-provenance`

Read-only. Rate-limited to 20 requests/minute per client. No
authentication required; writes nothing server-side.

### Request body

```jsonc
{
  "registry": "npm",                    // required — "npm" or "crates"
  "packageName": "@stellar/example-sdk", // required
  "evaluatedAt": "2026-03-01T12:00:00.000Z" // optional, defaults to now
}
```

### Response (`200`)

```jsonc
{
  "report": {
    "schemaVersion": "package-provenance/2026-01",
    "evaluatedAt": "2026-03-01T12:00:00.000Z",
    "registry": "npm",
    "packageName": "@stellar/example-sdk",
    "declaredRepository": "git+https://github.com/stellar/example-sdk.git",
    "releasesInspected": 15,
    "releasesAvailable": 58,
    "releases": [
      {
        "version": "1.2.0",
        "publishedAt": "2026-03-01T00:00:00.000Z",
        "maintainers": ["alice", "mallory"],
        "lifecycleScripts": [],
        "provenance": {
          "verdict": "verified",
          "sourceRepository": "https://github.com/stellar/example-sdk",
          "workflowPath": ".github/workflows/publish.yml",
          "commit": "b4893496f69116d9db2a4a90214a7236831b6656",
          "buildRunUrl": "https://github.com/stellar/example-sdk/actions/runs/36797106084/attempts/1",
          "notes": ["Build provenance attestation present and parsed from the npm registry."]
        },
        "tagMatch": { "state": "matched", "expectedTag": "v1.2.0", "note": "Matched tag v1.2.0 in the declared repository." }
      }
    ],
    "maintainerChanges": [
      { "fromVersion": "1.1.0", "toVersion": "1.2.0", "added": ["mallory"], "removed": [] }
    ],
    "installScriptChanges": [],
    "coverage": { "state": "complete", "note": "..." },
    "supplyChainVerdict": null,
    "readOnly": true
  }
}
```

### Error responses

| Status | `error` | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | The request body failed schema validation |
| 400 | `invalid_package_name` | `packageName` is not a valid identifier for the selected registry |
| 400 | `invalid_json` | The request body was not valid JSON |
| 413 | `payload_too_large` | The request body exceeded 16,384 bytes |
| 429 | — | Rate limit exceeded (20 requests/minute) |
| 500 | `package_provenance_inspection_failed` | An unexpected error occurred |

Note: a registry or repository that cannot be reached is **not** an error
response. It is a `200` with `coverage.state` set to `"unavailable"` (or
`"partial"` when only the repository-tag check failed) and `releases: []`
or partially-covered release entries — see `package-provenance-evidence.md`.

All responses carry `cache-control: no-store`.
