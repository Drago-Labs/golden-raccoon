# Evidence used by the issuance ledger

Sources:

- Issuer account operations in the requested ledger window: payments, path payments, claimable-balance creation, and clawbacks that name the selected asset.
- Network-reported outstanding supply from Horizon `/assets` for `asset_code` + `asset_issuer`. Live supply is attached as a checkpoint at the window end when available. Fixture checkpoints may include intermediate ledgers.
- Opening supply for the window when a fixture or reader provides it. A missing opening defaults to zero stroops and is reflected in coverage.

Limits:

- At most 5 pages, 200 records per page, and 1,000 operations.
- The ledger window cannot exceed 500,000 ledgers.
- Provider responses over 1,000,000 bytes are rejected.
- Duplicate paging tokens are ignored.
- Unreconciled gaps include up to two operations before and after the checkpoint index.

Out of scope: asserting issuer misconduct, tax or cost basis, price conversion, and risk-score changes.
