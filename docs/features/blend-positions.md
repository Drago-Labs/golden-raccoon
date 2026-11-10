# Blend Pool Positions & Liquidation Distance

## Method

1. **Rate Index Conversion**: Converts `bTokens` (supply) using floor integer division `(bTokens * bRate) / 10^9` and `dTokens` (debt) using ceiling integer division `ceil((dTokens * dRate) / 10^9)`.
2. **Effective Collateral & Liability**: Applies each reserve's `collateralFactorBps` (`CF / 10000`) to supply value and `liabilityFactorBps` (`10000 / LF`) to borrow value.
3. **Health Factor & Liquidation Scenarios**: Computes `HF = EffectiveCollateral / EffectiveLiability` and solves single-asset price changes that bring `HF` to `1.0`.
