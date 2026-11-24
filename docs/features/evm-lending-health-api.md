# Lending health API

`POST /api/insights/evm-lending-health` accepts an EVM `address`, `market` (`aave-v3-ethereum` or `aave-v3-base`), and optional `priceMovePercent`. It returns health factor, remaining borrow capacity, debt, E-mode status, positions with liquidation prices and oracle freshness, sensitivity rows, and coverage notices. Responses are rate-limited, read-only, and `no-store`.
