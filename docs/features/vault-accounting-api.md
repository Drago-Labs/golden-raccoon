# Vault accounting — API

`POST /api/insights/vault-accounting`

Requires an authenticated wallet session (see `@/server/security/walletSession`); rate-limited to 20 requests/minute per client under the `vault-accounting:read` namespace.

## Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `walletAddress` | `string` (EVM address) | yes | Must match the authenticated session wallet. |
| `network` | `string` | yes | One of the networks in `@/lib/evm/config` (e.g. `ethereum`, `base`, `arbitrum`). |
| `walletNetwork` | `string` | yes | Must equal `network`. |
| `vaultAddress` | `string` (EVM address) | yes | The ERC-4626 vault to inspect. |
| `blockNumber` | `number` | no | Recorded block to read at; defaults to the chain's latest block. |
| `sampleAmounts` | `string[]` | no | Up to 5 deposit amounts, each a positive integer string in the underlying asset's smallest unit, to check for rounding behavior. |

## Response

`200` with a `VaultAccountingResult` body on success; `503` when the provider could not be reached at all (`state: "unavailable"`); `400` for a validated request error; `403` when the wallet session does not authorize the request.

```ts
type VaultAccountingResult = {
  network: string;
  vaultAddress: string;
  blockNumber: number | null;
  state: "complete" | "partial" | "unavailable";
  conformance: { conforming: boolean; missing: string[] };
  asset: string | null;
  totalAssets: string | null;
  totalSupply: string | null;
  sharePrice: { assetsPerShareScaled: string; scale: string } | null;
  roundingSamples: Array<{
    amount: string;
    sharesFromDeposit: string | null;
    assetsRoundTrip: string | null;
    lossRaw: string | null;
    direction: "favors_vault" | "favors_depositor" | "exact" | "unavailable";
  }>;
  underlyingBalance: {
    totalAssets: string | null;
    actualBalance: string | null;
    assetsElsewhere: string | null;
    deficit: boolean;
  } | null;
  priceSamples: Array<{ blockNumber: number; sharePrice: { assetsPerShareScaled: string; scale: string } | null }>;
  priceJumps: Array<{ fromBlock: number; toBlock: number; changeBps: number }>;
  coverage: {
    reachedProvider: boolean;
    conformance: { conforming: boolean; missing: string[] };
    roundingSamplesRequested: number;
    roundingSamplesAvailable: number;
    priceSamplesRequested: number;
    priceSamplesAvailable: number;
  };
  warnings: string[];
};
```

All integer fields (`totalAssets`, `totalSupply`, share-price components, rounding amounts) are decimal strings, not JSON numbers, since vault values routinely exceed `Number.MAX_SAFE_INTEGER`.
