# POST /api/insights/bridge-latency

Request: `{ "bridge", "now", "windowSeconds", "stuckAfterSeconds", "sends", "deliveries" }`.

Each send is `{ "id", "route", "sentAt", "tx", "bridge", "format": "standard" }`. Each delivery is `{ "id", "deliveredAt" }`.

Ready response: `{ "kind": "ready", "report": { "bridge", "routes", "stuck", "matched", "coverage" } }`. `routes[].p50` and `p95` are seconds.

`400` invalid JSON. `413` over the byte ceiling. `Cache-Control: no-store`.
