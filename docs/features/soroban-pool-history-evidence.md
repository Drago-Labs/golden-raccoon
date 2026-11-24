# Soroban pool history evidence

## Data sources

### Pool events

- **Source**: Soroban RPC `getEvents` (or fixture recordings in tests)
- **Filter**: Events emitted by the pool contract id
- **Topics**: `swap`, `deposit`, `withdraw`, `sync`
- **Limit**: Up to 5,000 events per request window

### Opening and storage reserves

- **Opening**: Reserves at the start of the selected ledger window (from recorded snapshot or prior sync)
- **Storage**: Current on-chain pool storage at evaluation time
- **Coverage**: Depends on RPC history retention

### Price series

- Derived only from rebuilt reserves (`reserveB / reserveA`)
- No external oracle or trade tape is required

## Coverage gaps

| Reason | Meaning |
| --- | --- |
| `truncated_history` | Event page limit or provider truncation |
| `missing_storage` | Current storage could not be read |
| `unknown_layout` | Event topic or payload is not a supported layout |

## Rate limits and bounds

- Request rate: 20 requests / minute / namespace
- Max ledger window: 100,000 ledgers
- Max request body: 16,384 bytes
- Timeout: 30 seconds
- Max large trades returned: 25
