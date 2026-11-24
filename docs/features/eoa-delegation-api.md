# Delegation inspector API

`POST /api/insights/eoa-delegation` accepts `{ "address": "0x…", "network": "ethereum" }`. It returns current state (`delegated`, `plain`, or `unavailable`), decoded target, known implementation, source-verification state, capabilities, authorization history, and coverage notices. Responses are rate-limited and `no-store`; invalid addresses or unsupported chains return HTTP 400.
