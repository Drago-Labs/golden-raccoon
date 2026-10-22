# Deployer history — API

`POST /api/insights/deployer-history`

Requires an authenticated wallet session (see `@/server/security/walletSession`); rate-limited to 10 requests/minute per client under the `deployer-history:read` namespace (lower than most insight routes, since each request can fetch dozens of full blocks).

## Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `walletAddress` | `string` (EVM address) | yes | Must match the authenticated session wallet. |
| `network` | `string` | yes | One of the networks in `@/lib/evm/config`. |
| `walletNetwork` | `string` | yes | Must equal `network`. |
| `contractAddress` | `string` (EVM address) | yes | The contract to profile the deployer of. |

## Response

`200` with a `DeployerHistoryResult` body on success; `503` when the provider could not be reached at all (`state: "unavailable"`); `400` for a validated request error; `403` when the wallet session does not authorize the request.

```ts
type DeployerHistoryResult = {
  network: string;
  contractAddress: string;
  state: "complete" | "partial" | "unavailable";
  lookup: {
    deployer: string | null;
    creationBlock: number | null;
    creationTxHash: string | null;
    direct: boolean;
  };
  deployments: Array<{ address: string; blockNumber: number; txHash: string; codeHash: string | null }>;
  templateGroups: Array<{ codeHash: string; deployments: string[] }>;
  fundingTrail: Array<{
    hop: number;
    address: string;
    transactions: Array<{ from: string; to: string; blockNumber: number; txHash: string; valueWei: string }>;
  }>;
  flaggedMatches: Array<{ address: string; codeHash: string; source: string; label: string }>;
  coverage: {
    deployerFound: boolean;
    deploymentScan: { fromBlock: number; toBlock: number; truncated: boolean } | null;
    fundingHopsRequested: number;
    fundingHopsCompleted: number;
  };
  warnings: string[];
};
```

`templateGroups` and `flaggedMatches` are computed over the target contract's own code hash together with every deployment found in `deployments` — a match on the target address itself is possible and is the most important signal this endpoint can return.
