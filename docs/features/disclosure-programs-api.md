# Disclosure programs API

`POST /api/insights/disclosure-programs` accepts `projectUrl`, optional documentation and platform URLs, and known deployments with evidence links. It returns parsed RFC 9116 fields, scope, exact deployment coverage, published reward tiers, all checked sources, coverage text, and `readOnly: true`.

Responses are `no-store`; invalid input returns 400, oversized input 413, and complete provider unavailability 503.
