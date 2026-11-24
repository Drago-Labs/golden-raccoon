# Invocation Profile

## Overview

Read-only profile of who calls a Soroban contract, which functions they call, and how usage changes over a bounded ledger window.

## Method

### Input

- **Contract ID**: Soroban contract address (`C…`)
- **Network**: `stellar-testnet` or `stellar-pubnet`
- **Window**: Inclusive start and end ledger numbers

### Steps

1. **Validate input** — Reject invalid contract ids and oversized windows.
2. **Read invocations** — Sample contract invocations in the window, including calls made through other contracts.
3. **Attribute callers** — Credit the originating account and, when nested, the intermediary contract.
4. **Aggregate functions** — Count success and failure per function with unique caller mix.
5. **Aggregate callers** — Count success and failure per originating account with function list.
6. **Daily series** — Bucket counts by calendar day with unique callers.
7. **Concentration** — Top-caller share and Herfindahl index on invocation counts.
8. **Cohorts** — Split new versus returning callers using prior activity outside the window.
9. **Coverage** — Report truncation and provider gaps without inventing missing rows.

## Attribution rules

- Direct account callers have no intermediary.
- Nested calls keep both the originating account and the intermediary contract id.
- Failed invocations are counted separately from successes.

## Limitations

- Does not identify real-world operators of accounts.
- Sampling may truncate at the feature invocation limit.
- Prior-activity data for cohorts depends on provider history depth.
