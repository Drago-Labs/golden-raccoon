# SEP-41 conformance API

## Endpoint

```
POST /api/insights/sep41-conformance
```

## Request schema

```json
{
  "contractId": "C…",
  "network": "stellar-pubnet",
  "balanceId": "G… (optional)"
}
```

## Response schema

```json
{
  "report": {
    "schemaVersion": "sep41-conformance/2026-01",
    "referenceVersion": "SEP-41/2024-11",
    "contractId": "string",
    "network": "string",
    "state": "complete | partial | unavailable",
    "interfaceDiff": [
      {
        "name": "string",
        "kind": "missing | mismatched | extra | match",
        "detail": "string"
      }
    ],
    "simulations": [
      {
        "function": "decimals | name | symbol | balance",
        "ok": true,
        "value": "string | number | null",
        "authorizationRequired": false,
        "error": "string | null"
      }
    ],
    "eventSamples": [],
    "eventShapes": [],
    "findings": [],
    "coverage": {
      "referenceVersion": "SEP-41/2024-11",
      "message": "string"
    },
    "readOnly": true,
    "writesState": false
  }
}
```

## Status codes

- `200`: Report produced (complete or partial)
- `400`: Invalid request or contract id
- `413`: Payload too large
- `429`: Rate limit exceeded
- `503`: Provider unavailable
