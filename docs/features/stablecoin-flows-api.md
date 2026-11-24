# Stablecoin flows — API

`POST /api/insights/stablecoin-flows`

Public market evidence: no wallet session is required. Rate-limited to 10 requests/minute per client under the `stablecoin-flows` namespace. Responses are `cache-control: no-store`.

## Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `assetId` | `string` | yes | A configured asset id: `usdc`, `eurc` or `usdt`. Unknown ids are rejected with `unknown_asset`. |
| `chains` | `string[]` | no | Up to 8 chains, each named once. Omit or pass `[]` to read every chain the asset is configured on. A chain the asset is not configured on is rejected with `unsupported_chain` rather than returning an empty result. |
| `windowStart` | ISO 8601 `string` | yes | Start of the window. |
| `windowEnd` | ISO 8601 `string` | yes | Must be after `windowStart`, by at most 90 days. |
| `topEvents` | `number` | no | How many of the largest single events to rank, 1–25. Defaults to `10`. |

## Response

`200` with a `StablecoinFlowResult` whose `state` is `"ready"`; `503` with `state: "unavailable"` and a `reason` when no configured chain could be read (the report is still returned, with its coverage, and every total at zero); `400` with `{ error, message }` for `invalid_json`, `invalid_request`, `unknown_asset`, `unsupported_chain` or `malformed_response`; `413` for a body over 32,768 bytes; `429` when rate-limited; `500` with `flow_read_failed` for an unexpected failure, with no provider detail.

```ts
type StablecoinFlowResult =
  | { state: "ready"; report: StablecoinFlowReport }
  | { state: "unavailable"; report: StablecoinFlowReport; reason: string };

type StablecoinFlowReport = {
  state: "complete" | "partial" | "unavailable";
  asset: { id: string; symbol: string; name: string; canonicalDecimals: number };
  window: { start: string; end: string; days: number };
  daily: DailyFlow[];          // one row per UTC day and read chain, ordered by day then chain
  netIssuance: NetIssuance;    // across the window
  netByChain: Array<NetIssuance & { chain: string }>;
  largestEvents: FlowEvent[];  // ranked by amount, at most `topEvents`
  coverage: ChainCoverage[];   // one row per requested deployment
  notes: string[];             // what the report rests on and what it does not cover
  readOnly: true;
};

type DailyFlow = {
  day: string;                 // UTC date, YYYY-MM-DD
  chain: string;
  mintUnits: string; burnUnits: string; netUnits: string;   // exact integers, canonical scale
  mint: string; burn: string; net: string;                  // the same values as decimal strings
  eventCount: number;
};

type NetIssuance = Omit<DailyFlow, "day" | "chain">;

type FlowEvent = {
  chain: string;
  direction: "mint" | "burn";
  amountUnits: string;         // integer, canonical scale
  amount: string;              // decimal string
  at: string;                  // the instant the chain recorded
  day: string;                 // UTC day it is aggregated into
  txId: string;
  txUrl: string;               // that chain's public explorer
  source: string;              // the call the event was read from
};

type ChainCoverage = {
  chain: string;
  state: "complete" | "partial" | "unavailable";
  eventCount: number;
  truncated: boolean;          // the provider page filled the reader's budget
  firstEventAt: string | null;
  lastEventAt: string | null;
  notes: string[];
  identity: string;            // token address, or ASSET:ISSUER on Stellar
  sourceUrl: string;           // the issuer's published contract list
};
```

Amounts are decimal strings and exact integer unit strings, both in the asset's canonical scale (the largest decimals of any of its deployments), so no value passes through binary floating point. A chain whose `state` is not `"complete"` contributes a floor rather than a total, and a chain whose `state` is `"unavailable"` contributes no `daily` row at all.
