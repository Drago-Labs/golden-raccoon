# Circulating supply evidence and limits

EVM values come from `totalSupply()` and `balanceOf()` at a recorded block. Stellar values come from Horizon asset and account records at a recorded ledger. Every excluded address must link to the policy, deployment record, vesting agreement, or burn proof that justifies exclusion.

Reported sources retain their URL and fetch time and are never averaged. Provider failure is shown as unavailable. A complete result only means all configured sources replied; it does not prove the configured exclusion list is exhaustive.
