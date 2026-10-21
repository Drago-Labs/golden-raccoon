# Evidence used by balance reconciliation

Sources:

- Account effects in the requested ledger window: payment credits and debits, trades, liquidity-pool deposits, withdrawals, and trades, claimable-balance creation and claims, and clawbacks.
- Account transactions in the same window. `fee_charged` is in stroops. It is applied to `fee_account` when that field is present, otherwise to `source_account`.
- Opening and closing balances recorded for that window. A live Horizon account balance is not treated as the historical end balance. When either snapshot is absent the report is partial.

Limits:

- At most 5 pages, 200 records per page, and 1,000 effects or transactions.
- The ledger window cannot exceed 500,000 ledgers.
- Provider responses over 1,000,000 bytes are rejected.
- Duplicate paging tokens are ignored.

Unknown effect types are listed and left out of the sum. They do not get a guessed sign. Truncated history names the oldest fetched ledger and is never reported as a match.

Out of scope: tax, cost basis, price conversion, and risk-score changes.
