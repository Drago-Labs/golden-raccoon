# Invocation Profile Evidence

## Data sources

### Contract invocations

- **Source**: Stellar RPC / Horizon-compatible invocation or event history for the target contract
- **Includes**: Direct calls and nested calls that reach the target through another contract
- **Fields used**: ledger, day, function name, success flag, direct caller, originating account, intermediary

### Prior activity (cohorts)

- **Source**: Same provider history before `windowStart`
- **Use**: Accounts with any prior day listed are returning callers; others are new in the window

## Sampling and attribution limits

| Bound | Value |
| --- | --- |
| Max request body | 8,192 bytes |
| Max ledger window | 100,000 ledgers |
| Max sampled invocations | 10,000 |
| Max functions / callers in response | 500 / 2,000 |
| Max daily points | 366 |
| Timeout | 30 seconds |

Truncation is reported as a coverage gap with reason `truncated`. Provider gaps use `provider_gap`.

## What this does not prove

- That an account is controlled by a particular person or organization
- Completeness beyond the provider's retained history
- Future usage or intent
