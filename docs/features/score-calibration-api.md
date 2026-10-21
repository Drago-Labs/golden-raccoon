# Score calibration report — API

## `POST /api/insights/score-calibration`

Read-only. Rate-limited to 20 requests/minute per client. No
authentication required; writes nothing server-side, and never touches
the risk-publication history it reads.

### Request body

```jsonc
{
  "outcomeType": "large_drawdown",    // required — "large_drawdown" | "depeg" | "incident_report"
  "horizonDays": 30,                  // required — 7 | 30 | 90
  "network": "pubnet",                // optional, "testnet" or "pubnet", defaults to "pubnet"
  "evaluatedAt": "2026-03-01T12:00:00.000Z" // optional, defaults to now
}
```

### Response (`200`)

```jsonc
{
  "report": {
    "schemaVersion": "score-calibration/2026-01",
    "evaluatedAt": "2026-03-01T12:00:00.000Z",
    "network": "pubnet",
    "outcomeType": "large_drawdown",
    "horizonDays": 30,
    "buckets": [
      {
        "bucket": { "label": "0-20", "scoreRangeLow": 0, "scoreRangeHigh": 20 },
        "sampleSize": 42,
        "outcomeCount": 6,
        "observedRate": 0.142857,
        "confidenceInterval": { "low": 0.0672, "high": 0.2691 },
        "sufficientSample": true
      }
    ],
    "excludedSnapshots": [
      { "snapshotId": "...", "assetKey": "...", "reason": "horizon_not_elapsed", "note": "..." }
    ],
    "totalSnapshotsRead": 58,
    "totalSnapshotsIncluded": 42,
    "coverage": { "state": "partial", "note": "..." },
    "scoringModelUnchanged": true,
    "readOnly": true
  }
}
```

### Error responses

| Status | `error` | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | The request body failed schema validation (including an `horizonDays` outside `7`/`30`/`90`) |
| 400 | `invalid_json` | The request body was not valid JSON |
| 413 | `payload_too_large` | The request body exceeded 4,096 bytes |
| 429 | — | Rate limit exceeded (20 requests/minute) |
| 500 | `score_calibration_failed` | An unexpected error occurred |

A request with no readable history, or one where every snapshot's
horizon is still open, is **not** an error: it is a `200` with
`coverage.state` of `"empty"` or `"unavailable"` and empty buckets. See
`score-calibration-evidence.md` for exactly when each coverage state
applies, and for why `depeg`/`incident_report` currently exclude every
snapshot.

All responses carry `cache-control: no-store`.
