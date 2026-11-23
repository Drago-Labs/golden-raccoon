# Pool Share Returns

## Overview

This feature compares liquidity-pool fee income with divergence loss for a share position over a specified window.

## Method

### Input

- **Account**: Stellar account address holding LP shares
- **Pool ID**: Liquidity pool identifier
- **Network**: stellar-testnet or stellar-pubnet
- **Window**: Start and end ledger numbers

### Calculation Steps

1. **Reconstruct Position**: Read deposit and withdrawal operations to determine share balance throughout the window
2. **Read Reserve Snapshots**: Query pool reserves at regular intervals
3. **Read Price Series**: Obtain asset prices from trades or oracle
4. **Calculate Hold Value**: Determine what the assets would be worth if simply held
5. **Calculate Pool Value**: Determine current value of LP position
6. **Calculate Fee Income**: Extract fee accumulation from reserve growth
7. **Calculate Divergence Loss**: Compare pool value + fees vs hold value

### Formula

```
divergence_loss = hold_value - (pool_value + fee_income)
total_return = pool_value - hold_value
```

### Precision

All calculations use stroop-level precision (7 decimal places). Results reconcile to within 1 stroop.

## Limitations

- Does not interpolate missing data - gaps are reported
- Does not build or recommend transactions
- Does not calculate tax basis or cost basis
- Price sources may have limited historical depth
