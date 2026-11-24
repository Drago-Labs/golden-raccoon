# Lending health evidence and limits

The report uses pool reserve parameters, user configuration, balances, oracle prices, and oracle update timestamps at one read snapshot. Prices older than the market's configured maximum age are marked stale. Results can differ from execution because balances, interest indexes, prices, and protocol parameters change. Supported fixtures cover Aave v3 Ethereum and Base; this read-only feature cannot supply, repay, or liquidate.
