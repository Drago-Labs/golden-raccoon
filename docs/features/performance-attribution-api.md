# Performance attribution — API

`POST /api/insights/performance-attribution`

Requires an authenticated wallet session (`@/server/security/walletSession`) and the `portfolio:read` capability for the requested wallet and network. Rate-limited to 12 requests/minute per client under the `performance-attribution` namespace. Responses are `cache-control: no-store`.

The session cookie decides whose portfolio is attributed: a `walletAddress` in the body is only accepted when it matches the session wallet, and the session value is what reaches the service.

## Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `walletAddress` | `string` | yes | EVM `0x…` or Stellar `G…`; must match the session wallet and the family of `network`. |
| `network` | `string` | yes | The network the observations were read on. |
| `windowStart` | ISO 8601 `string` | yes | Start of the window. |
| `windowEnd` | ISO 8601 `string` | yes | After `windowStart`, by at most 370 days. |
| `granularity` | `"day" \| "week" \| "month"` | no | Period length; periods are UTC-aligned. Defaults to `"day"`. At most 120 periods per report. |
| `snapshots` | `SnapshotInput[]` | no | Up to 400 recorded observations of this portfolio. Defaults to `[]`. |
| `includeLiveSnapshot` | `boolean` | no | Read the live portfolio as one more observation. Defaults to `false`. |

```ts
type SnapshotInput = {
  walletAddress: string;
  network: string;
  at: string;                  // ISO 8601
  source: string;
  holdings: Array<{
    key: string;               // chain-scoped asset identity
    symbol: string;
    chain: string;
    quantity: string | number;
    priceUsd: string | number | null;   // null when the provider had none
    valueUsd: string | number | null;
  }>;
};
```

## Response

`200` with an `AttributionResult` whose `state` is `"ready"`; `503` with `state: "unavailable"` and a `reason` when no period could be attributed (the report is still returned, with its coverage and null totals); `400` with `{ error, message }` for `invalid_json`, `invalid_request`, `identity_mismatch`, `malformed_snapshot` or `provider_unavailable`; `413` for a body over 262,144 bytes; `403` with `{ error: "auth_error", reason }` when the session or capability check fails; `429` when rate-limited; `500` with `attribution_failed` for an unexpected failure, without provider detail.

```ts
type AttributionResult =
  | { state: "ready"; report: AttributionReport }
  | { state: "unavailable"; report: AttributionReport; reason: string };

type AttributionReport = {
  state: "complete" | "partial" | "unavailable";
  portfolio: { walletAddress: string; network: string };
  window: { start: string; end: string; granularity: "day" | "week" | "month" };
  periods: PeriodAttribution[];
  totals: {
    changeUsd: string | null;        // null when any attributed period could not state it
    externalFlowUsd: string;
    marketUsd: string | null;
    priceEffectUsd: string | null;
    residualUsd: string | null;
    attributedPeriods: number;
    unavailablePeriods: number;
  };
  coverage: string[];
  readOnly: true;
};

type PeriodAttribution = {
  start: string; end: string; label: string;
  state: "complete" | "partial" | "unavailable";
  startObservedAt: string | null; endObservedAt: string | null;
  startValueUsd: string | null; endValueUsd: string | null;
  changeUsd: string | null;
  externalFlowUsd: string;
  marketUsd: string | null;
  priceEffectUsd: string | null;
  residualUsd: string | null;
  assets: AssetContribution[];
  chains: ChainContribution[];
  flowCount: number;
  notes: string[];
};

type AssetContribution = {
  key: string; symbol: string; chain: string;
  startValueUsd: string | null; endValueUsd: string | null;
  changeUsd: string | null;
  externalFlowUsd: string;
  marketUsd: string | null;
  priceEffectUsd: string | null;
  residualUsd: string | null;
  marketShareBps: string | null;      // share of the period's market movement
  state: "complete" | "partial";
  notes: string[];
};

type ChainContribution = {
  chain: string;
  externalFlowUsd: string;
  marketUsd: string | null;
  priceEffectUsd: string | null;
  residualUsd: string | null;
  marketShareBps: string | null;
  state: "complete" | "partial";
};
```

Every amount is a decimal string produced from exact integer units (USD at 10⁻⁸), so no value passes through binary floating point. For any asset or period that is `complete`, `externalFlowUsd + priceEffectUsd + residualUsd` equals `changeUsd` exactly.
