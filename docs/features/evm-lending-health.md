# EVM lending health method

For each collateral, USD value is multiplied by its liquidation threshold. Health factor is the sum of threshold-adjusted collateral divided by total USD debt. E-mode substitutes its category threshold when active. A collateral's liquidation price solves the same equation at health factor 1 while holding other asset prices constant. Sensitivity rows recompute the complete formula after the stated single-asset price move.
