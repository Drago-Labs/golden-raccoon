# Flash-loan trace API

`POST /api/insights/flash-loan-trace` accepts `protocolAddresses`, `network`, `fromBlock`, and `toBlock`. It returns detected transactions with provider, borrowed/repaid assets, participant balance reconciliation, structured call path, text alternative, fidelity, and coverage notices. The route is read-only, rate-limited, bounded to 5,000 blocks, and `no-store`.
