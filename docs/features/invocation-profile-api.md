# Invocation Profile API

## Endpoint

```
POST /api/insights/invocation-profile
```

## Request schema

```typescript
{
  contractId: string;                          // Soroban C… id
  network: "stellar-testnet" | "stellar-pubnet";
  windowStart: number;                         // inclusive ledger
  windowEnd: number;                           // inclusive ledger
}
```

### Example request

```json
{
  "contractId": "CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR",
  "network": "stellar-testnet",
  "windowStart": 1000,
  "windowEnd": 2000
}
```

## Response schema

```typescript
{
  report: {
    schemaVersion: number;
    contractId: string;
    network: string;
    windowStart: number;
    windowEnd: number;
    state: "complete" | "partial" | "unavailable";
    functions: Array<{
      functionName: string;
      successCount: number;
      failureCount: number;
      uniqueCallers: number;
      directCallers: number;
      viaContractCallers: number;
    }>;
    callers: Array<{
      account: string;
      successCount: number;
      failureCount: number;
      functionNames: string[];
      directCount: number;
      viaContractCount: number;
      intermediaries: string[];
    }>;
    daily: Array<{
      day: string;
      successCount: number;
      failureCount: number;
      uniqueCallers: number;
    }>;
    concentration: {
      callerCount: number;
      totalInvocations: number;
      topCallerShare: number;
      topCallerAccount: string | null;
      herfindahl: number;
    };
    cohorts: {
      newCallers: number;
      returningCallers: number;
      newCallerAccounts: string[];
      returningCallerAccounts: string[];
    };
    coverageGaps: Array<{
      fromLedger: number;
      toLedger: number;
      reason: "truncated" | "provider_gap";
    }>;
    coverageNotice: string;
    sampledInvocationCount: number;
    readOnly: true;
  }
}
```

## Status codes

| Status | Meaning |
| --- | --- |
| 200 | Profile ready (`complete` or `partial`) |
| 400 | Invalid request or contract id |
| 413 | Payload too large |
| 503 | Provider unavailable (`state: unavailable`, `Retry-After: 15`) |
| 504 | Timed out |

## Rate limit

20 requests per minute under the `invocation-profile` namespace.
