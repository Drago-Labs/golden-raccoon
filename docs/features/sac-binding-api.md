# SAC Binding Verifier — API

`POST /api/insights/sac-binding`

Request: `{ asset?: string, contractId?: string, network: "stellar-testnet" | "stellar-mainnet" }`
Response: `{ report: SacBindingReport }`
