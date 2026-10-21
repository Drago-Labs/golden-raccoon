# Policy change tracker — API

## `POST /api/insights/policy-changes`

Read-only. Rate-limited to 20 requests/minute per client. No authentication
required; writes nothing server-side.

### Request body

```jsonc
{
  "projectId": "sdf-terms",           // required — must match a registry entry
  "evaluatedAt": "2026-03-01T12:00:00.000Z", // optional, defaults to now
  "priorSnapshots": []                // optional, up to 50 entries this session already holds
}
```

A `priorSnapshots` entry has the same shape as a `PolicySnapshot` in the
response (see below) — the client is expected to pass back exactly what a
prior response gave it.

### Response (`200`)

```jsonc
{
  "report": {
    "schemaVersion": "policy-changes/2026-01",
    "evaluatedAt": "2026-03-01T12:00:00.000Z",
    "projectId": "sdf-terms",
    "projectLabel": "Stellar Development Foundation — Terms of Service",
    "policyUrl": "https://stellar.org/terms-of-service",
    "currentSnapshot": { "...": "PolicySnapshot" },
    "timeline": [ "...PolicySnapshot[]" ],
    "diffs": [ "...SnapshotDiff[]" ],
    "figureChanges": [ "...FigureChange[]" ],
    "coverage": { "state": "complete", "note": "..." },
    "legalOpinion": null,
    "changeIsObservationNotJudgment": true,
    "readOnly": true
  }
}
```

### Error responses

| Status | `error` | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | The request body failed schema validation |
| 400 | `unknown_project` | `projectId` does not match a registry entry |
| 400 | `invalid_json` | The request body was not valid JSON |
| 413 | `payload_too_large` | The request body exceeded 262,144 bytes |
| 429 | — | Rate limit exceeded (20 requests/minute) |
| 500 | `policy_change_tracking_failed` | An unexpected error occurred |

All responses carry `cache-control: no-store`.
