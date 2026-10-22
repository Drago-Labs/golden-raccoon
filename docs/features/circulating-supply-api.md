# Circulating supply API

`POST /api/insights/circulating-supply` accepts a discriminated `token` (`evm` or `stellar`), an optional observation, evidenced `exclusions`, and `reportedSources` with integer base-unit values and ISO fetch times.

The no-store response returns total, excluded, and implied supply; one comparison per source; the observation and evidence URL; coverage text; and `readOnly: true`. Invalid requests return 400, oversized requests 413, and unavailable providers 503 without inventing values.
