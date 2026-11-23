# Allocation drift — sources and limits

## Where the numbers come from

| Input | Source | Notes |
|---|---|---|
| Current holdings and prices | `getPortfolioSnapshot(walletAddress, network)` (`@/server/portfolio/getPortfolio`) | Only a `connected` read is used. Any other status is reported as unavailable; no mock portfolio is substituted. |
| Earlier observations | The caller's recorded observations: this wallet's versioned preference storage plus any offline portfolio captures already held for it | Normalized through the same `normalizedPortfolio` path as a live read, and dropped if they do not parse or belong to another wallet or network. |
| Target allocation | The user, through the target editor | Stored locally per wallet and network, never derived from market data. |
| Threshold | The user, as a percentage converted to basis points | Defaults to 500 bps. |

Asset identity is `chainId:tokenAddress` (lower-cased for EVM hex addresses, with the Stellar issuer appended when the read reports one), so one asset cannot appear twice in a snapshot or be counted in two groups.

## Hand-checkable fixture

`tests/features/allocation-drift/data/drifted-portfolio.json` records two reads of `0x4444…4444` on `ethereum`, both totalling 100,000 USD, against `balanced-target.json` (WETH 50% / USDC 40% / DAI 10%):

| Observation | Asset | Value USD | Weight | Target | Drift | Restore USD | Restore quantity |
|---|---|---|---|---|---|---|---|
| 2026-11-01 | WETH @ 2,000 | 50,000 | 5,000 bps | 5,000 bps | 0 | 0 | 0 |
| 2026-11-01 | USDC @ 1 | 40,000 | 4,000 bps | 4,000 bps | 0 | 0 | 0 |
| 2026-11-01 | DAI @ 1 | 10,000 | 1,000 bps | 1,000 bps | 0 | 0 | 0 |
| 2026-11-20 | WETH @ 2,500 | 60,000 | 6,000 bps | 5,000 bps | +1,000 bps | −10,000 | −4 WETH |
| 2026-11-20 | USDC @ 1 | 30,000 | 3,000 bps | 4,000 bps | −1,000 bps | +10,000 | +10,000 USDC |
| 2026-11-20 | DAI @ 1 | 10,000 | 1,000 bps | 1,000 bps | 0 | 0 | 0 |

With a 500 bps threshold, the 2026-11-20 observation is where WETH and USDC both moved above it — the two crossings the service reports.

`provider-unavailable.json` is the recorded read when no provider answered, and `invalid-target.json` is a target totalling 90%, which the validator rejects with `invalid_request`.

## Limits

- **Reported, not inferred.** A holding the provider could not price makes the whole valuation incomplete: weights, drift and restoration amounts for that observation are `null` and the report is `partial`. Prices and balances are never estimated, carried over or interpolated between observations.
- **Recorded observations only.** The history is exactly the observations already held locally, deduplicated by observation time; two different portfolios claiming the same observation time are refused (`malformed_snapshot`) rather than silently merged.
- **Precision.** USD amounts are exact to 10^-8 and truncated, never rounded up; basis points carry two decimal places; asset quantities carry up to 18. Thresholds are compared in hundredths of a basis point.
- **Bounds** (`limits.ts`): 200,000 request bytes, 200 holdings, 100 target entries, 80 observations, 90-day window. The route rejects an oversized body with `413` without buffering it.
- **Scope.** Weights use USD market values, not token quantities. Group targets report no asset quantity, because a group has no single price.
- **Advice.** None. The feature states amounts and coverage; it does not rank, score or recommend, and it cannot move funds.
