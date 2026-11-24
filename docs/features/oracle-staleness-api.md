# Oracle staleness API

`POST /api/insights/oracle-staleness` accepts `protocolAddress`, `network`, and `windowHours` (1–720). It returns feed configuration, update history statistics, current staleness, source-cited consumer findings, and coverage notices. The route is read-only, rate-limited, and returns `cache-control: no-store`.
