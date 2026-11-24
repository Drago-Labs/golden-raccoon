# Allocation drift — API

`POST /api/insights/allocation-drift`

Requires an authenticated wallet session (`@/server/security/walletSession`) and the `portfolio:read` capability for the requested wallet and network. Rate-limited to 12 requests/minute per client under the `allocation-drift` namespace. Responses are `cache-control: no-store`.

The session cookie decides whose portfolio is read: a `walletAddress` in the body is only accepted when it matches the session wallet, and the session value is what reaches the service.

## Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `walletAddress` | `string` | yes | EVM `0x…` address or Stellar `G…` account; must match the session wallet and the family of `network`. |
| `network` | `string` | yes | One of `ethereum`, `base`, `goat`, `arbitrum`, `optimism`, `polygon`, `bsc`, `avalanche`, `stellar-testnet`, `stellar-pubnet`. |
| `windowStart` | ISO 8601 `string` | yes | Start of the history window. |
| `windowEnd` | ISO 8601 `string` | yes | Must be after `windowStart`, by at most 90 days. |
| `thresholdBps` | `number` | no | 1–10,000 basis points of absolute drift. Defaults to `500`. |
| `targets` | `TargetDefinition` | no | Omit to read the portfolio without calculating drift. Entries must total exactly 10,000 bps. |
| `history` | `AllocationSnapshot[]` | no | Up to 80 previously recorded observations of the same wallet and network. Defaults to `[]`. |

```ts
type TargetDefinition = {
  version: 1;
  mode: "asset" | "group";
  entries: Array<{ key: string; label: string; basisPoints: number; members: string[] }>;
};

type AllocationSnapshot = {
  walletAddress: string;
  network: string;
  at: string;               // ISO 8601 observation time
  source: string;           // how the observation was obtained
  completeValuation: boolean;
  holdings: Array<{ key: string; label: string; valueUsd: string; priceUsd: string | null }>;
};
```

## Response

`200` with an `AllocationResult`; `503` with `state: "unavailable"` when no portfolio read was possible; `400` with `{ error, message }` for `invalid_json`, `invalid_request` or `malformed_snapshot`; `413` with `payload_too_large` for a body over 200,000 bytes; `403` with `{ error: "auth_error", reason }` when the session or capability check fails; `429` when rate-limited; `500` with `analysis_failed` for an unexpected failure, without provider detail.

```ts
type AllocationResult = {
  state: "ready" | "unavailable";
  snapshot: AllocationSnapshot | null;
  report: AllocationReport | null;   // null when no target was supplied
  reason?: string;                   // why no portfolio could be read
};

type AllocationReport = {
  state: "complete" | "partial";     // "partial" when coverage is incomplete
  walletAddress: string;
  network: string;
  target: TargetDefinition;
  current: DriftPoint;
  history: DriftPoint[];             // ordered by observation time
  crossings: Array<{ at: string; key: string; direction: "above" | "below"; driftBps: string }>;
  totalUsd: string;
  coverage: string[];                // what the answer does and does not cover
};

type DriftPoint = { at: string; rows: DriftRow[] };

type DriftRow = {
  key: string;                       // chainId:tokenAddress[:issuer], or a group key
  label: string;
  currentUsd: string;
  currentBps: string | null;         // null when the valuation is incomplete
  targetBps: number;
  driftBps: string | null;
  restoreUsd: string | null;         // negative: holds too much value
  restoreQuantity: string | null;    // asset targets with a usable price only
};
```

All amounts are decimal strings, so no value passes through binary floating point. `__unallocated__` appears as a `key` in group mode for holdings outside every group, with a target of 0 bps.
