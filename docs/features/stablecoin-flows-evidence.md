# Stablecoin flows — sources and limits

## Sources per chain

| Chain | What is read | Call | Mint | Burn |
|---|---|---|---|---|
| ethereum, base, arbitrum, optimism, polygon, avalanche, bsc | The configured token contract's `Transfer` logs | `eth_getLogs` with topic `Transfer(address,address,uint256)` and the zero address in the `from` or `to` topic, plus `eth_blockNumber` and `eth_getBlockByNumber` for timestamps | `from` = `0x0…0` | `to` = `0x0…0` |
| stellar | The issuing account's payments | Horizon `GET /accounts/{issuer}/payments?order=desc` | payment **from** the issuer | payment **to** the issuer |

RPC endpoints come from the repository's existing `@/lib/evm/config` per chain; the Horizon base URL comes from `HORIZON_URL`, defaulting to `https://horizon.stellar.org`. No third-party indexer, aggregator or price feed is involved.

### Configured deployments

| Asset | Chain | Identity | Decimals | Published source |
|---|---|---|---|---|
| USDC | ethereum | `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` | 6 | circle.com/multi-chain-usdc |
| USDC | base | `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` | 6 | circle.com/multi-chain-usdc |
| USDC | arbitrum | `0xaf88d065e77c8cc2239327c5edb3a432268e5831` | 6 | circle.com/multi-chain-usdc |
| USDC | optimism | `0x0b2c639c533813f4aa9d7837caf62653d097ff85` | 6 | circle.com/multi-chain-usdc |
| USDC | polygon | `0x3c499c542cef5e3811e1192ce70d8cc03d5c3359` | 6 | circle.com/multi-chain-usdc |
| USDC | avalanche | `0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e` | 6 | circle.com/multi-chain-usdc |
| USDC | stellar | `USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` | 7 | circle.com/multi-chain-usdc |
| EURC | ethereum, base, stellar | see `assetRegistry.ts` | 6 / 6 / 7 | circle.com/eurc |
| USDT | ethereum, arbitrum, polygon, bsc | see `assetRegistry.ts` | 6 / 6 / 6 / 18 | tether.to/en/transparency |

The registry is configuration a maintainer owns: the feature reads exactly what is declared there and discovers no contract on its own, so correcting or extending the list is a one-line change with no effect on the arithmetic.

## Hand-checkable fixture

`tests/features/stablecoin-flows/data/multi-chain-flows.json` records, for the window 2026-11-18T00:00:00Z → 2026-11-20T00:00:00Z:

| Source row | Raw amount | Canonical units (10⁻⁷ USDC) | As USDC |
|---|---|---|---|
| ethereum mint, block 0x15ec288, 2026-11-18T06:00:00Z | `1000000000000` (6 dp) | 10,000,000,000,000 | 1,000,000 |
| ethereum burn, block 0x15ed098, 2026-11-18T18:00:00Z | `250000000000` (6 dp) | 2,500,000,000,000 | 250,000 |
| ethereum burn, block 0x15ee5b0, 2026-11-19T12:00:00Z | `400000000000` (6 dp) | 4,000,000,000,000 | 400,000 |
| stellar mint, 2026-11-18T09:00:00Z | `50000.0000000` | 500,000,000,000 | 50,000 |
| stellar mint, 2026-11-19T21:00:00Z | `10000.0000000` | 100,000,000,000 | 10,000 |

Daily: 2026-11-18 ethereum `1,000,000 − 250,000 = +750,000`; 2026-11-19 ethereum `0 − 400,000 = −400,000`; stellar `+50,000` and `+10,000`. Window: `1,060,000 − 650,000 = +410,000` USDC, of which `+350,000` on Ethereum and `+60,000` on Stellar. The largest single event is the 1,000,000 USDC mint, linked to its own Ethereum transaction.

The same page also records evidence that must **not** be counted: a EURC payment from a different issuer, a USDC payment between two third parties, a `create_account` operation on the issuing account, and a payment older than the window (which is how the reader knows it has covered the window).

`single-chain.json` is the Stellar-only recording, `partial-coverage.json` records one chain whose provider answered with an error and one chain younger than the window, and `provider-unavailable.json` records every provider failing. Fixture rows carry `_at` and `_direction` annotations alongside the recorded fields so a reader can see what each log is without decoding it; the feature reads only the real fields.

## Limits

- **Coverage, not completeness.** An `eth_getLogs` page that fills the reader's event budget, a Horizon page sequence that stops before the window starts, and a chain younger than the window are each reported as incomplete coverage: those totals are a floor, not a sum.
- **Derived block ranges.** An EVM node cannot be asked for "blocks since a timestamp", so the range is derived from each chain's nominal block time and every event is then placed on the day *its own block's timestamp* says. A wrong block-time estimate can only widen or narrow the scan — it cannot move an event to the wrong day.
- **Unavailable is not zero.** A chain that could not be read is excluded from daily rows and every total, and named in both the coverage table and the notes.
- **Bounds** (`limits.ts`): 90-day window, 8 chains, 500 events and 200 timestamped blocks per chain, 10 log pages of 50,000 blocks, 10 Horizon pages of 200 records, 25 ranked events, 32,768 request bytes, 8-second provider timeout.
- **No price, no forecast.** Supply flow is not peg behaviour. The feature reads no price and makes no prediction.
- **Burn convention.** Tokens sent to a non-zero dead address, or held by a bridge lock contract, are transfers rather than burns and are not counted; only zero-address `Transfer` logs and issuer-account payments are.
