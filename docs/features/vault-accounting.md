# ERC-4626 vault accounting

A read-only workbench that explains an ERC-4626 vault's share price, compares what it reports (`totalAssets()`) against what it directly holds in its underlying asset, and checks deposit rounding with exact integer arithmetic — all at one identified block.

## What it checks

- **Conformance**: whether `asset()`, `totalAssets()`, `totalSupply()`, `convertToAssets`, `previewDeposit`, and `previewRedeem` all respond. A vault missing any of these is reported as non-conforming, not silently skipped.
- **Share price**: `totalAssets / totalSupply`, scaled by 10^18 so no precision is lost. This mirrors a fee-free `convertToAssets(1 share)` without the risk of a single share rounding to zero for a high-value vault.
- **Underlying balance comparison**: the vault's own ERC-20 balance of its underlying asset versus its reported `totalAssets()`. A gap is reported as "assets held elsewhere" — not a verdict, since a vault may legitimately deploy capital into a strategy, but it is exactly what an inflated `totalAssets` or a donation-based price manipulation would also produce.
- **Deposit rounding**: for each caller-supplied sample amount, `previewDeposit(amount)` followed by `convertToAssets` of the resulting shares, compared back to the original amount with exact integer subtraction. The direction (favors the vault, favors the depositor, or exact) and the raw loss are both reported.
- **Share-price history**: up to 5 evenly spaced samples across a bounded block window, with any consecutive move of 5% or more flagged as a sudden jump.

## Scope and limits

- Read-only. No deposit, withdraw, or transaction-submission action exists in this feature.
- Values are reported in raw integer units (the asset's smallest denomination); this feature does not read `decimals()` or attempt decimal-aware display formatting.
- The price-history window is capped at 50,000 blocks; a younger chain simply returns a shorter window rather than failing.

## Run the focused suite

```
npm run test -- --run tests/features/vault-accounting
```
