# Soroban pool history

## Overview

Reconstruct constant-product AMM pool reserves and implied prices from the pool contract's own events, then compare the rebuilt end state with current storage.

## Method

### Input

- **Pool contract**: Soroban contract id (`C…`)
- **Network**: `stellar-testnet` or `stellar-pubnet`
- **Ledger range**: Inclusive `fromLedger` / `toLedger`

### Steps

1. **Read events** for the pool over the bounded ledger range (swap, deposit, withdraw, sync).
2. **Parse layouts** into typed deltas or absolute sync values. Unknown topics become an unsupported state.
3. **Replay reserves** in ledger order from the opening balances.
4. **Build price series** as implied `reserveB / reserveA` after each snapshot.
5. **Check storage** by comparing the rebuilt end reserves with current pool storage.
6. **Rank large trades** by absolute implied-price move and attach transaction hashes.

### Supported event layouts

| Topic | Fields | Effect |
| --- | --- | --- |
| `swap` | `amountA`, `amountB`, `direction` (`a_to_b` \| `b_to_a`) | Adjusts reserves by in/out amounts |
| `deposit` | `amountA`, `amountB` | Adds both reserves |
| `withdraw` | `amountA`, `amountB` | Subtracts both reserves |
| `sync` | `reserveA`, `reserveB` | Sets absolute reserves |

### Precision

Reserves are tracked as integers (token base units). Implied price is scaled to nine decimal places. Drift is exact integer comparison — no tolerance.

## Limitations

- Does not interpolate missing events
- Does not trade, route, or predict prices
- Truncated history is reported as partial, never as a clean match
- Unknown layouts stop reconstruction with an unsupported state
