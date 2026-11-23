# Frontend integrity evidence and limits

The source is the recorded HTML and response headers in the request. The monitor does not execute JavaScript and does not fetch third-party script bodies.

Limits: 200000 bytes of HTML, 100 scripts, 20 stored snapshots, 250000 byte requests, 8 second budget.

A timeout is `{ "kind": "unavailable" }`. A body that is not an object is `{ "kind": "unknown_format" }`.
