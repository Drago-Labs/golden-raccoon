# Pool Share Returns Evidence

## Data Sources

### Reserve Snapshots

- **Source**: Horizon API or Stellar RPC
- **Endpoint**: `/liquidity_pools/{pool_id}/operations` or equivalent RPC method
- **Coverage**: Depends on provider history depth
- **Limit**: Up to 10,000 snapshots per window

### Share Balance

- **Source**: Account operations history
- **Operations**: `change_trust`, `liquidity_pool_deposit`, `liquidity_pool_withdraw`
- **Coverage**: Full operation history from account creation
- **Limit**: Up to 1,000 position snapshots per window

### Price Data

- **Primary Source**: Horizon trades endpoint
- **Fallback**: External price oracles (if configured)
- **Coverage**: Varies by asset pair and trading activity
- **Limit**: Up to 10,000 price points per window

## Coverage Gaps

When data is unavailable:

- **Missing Reserves**: Gap reported with ledger range
- **Missing Prices**: Gap reported with reason
- **Partial Data**: State marked as "partial", calculation proceeds with available data

## Rate Limits

- **Request Rate**: 20 requests per minute per namespace
- **Window Size**: Maximum 100,000 ledgers per request
- **Payload Size**: Maximum 8192 bytes request size
- **Timeout**: 30 seconds per calculation
