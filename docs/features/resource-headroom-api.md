# Soroban Resource Headroom — API

`POST /api/insights/resource-headroom`

Request: `{ mode, contractId?, functionName?, args?, txHash?, warningThresholdPct, network }`
Response: `{ report: ResourceHeadroomReport }`
