# Delegate participation — API

`POST /api/insights/delegate-participation`

Public governance evidence: no wallet session is required. Rate-limited to 10 requests/minute per client under the `delegate-participation` namespace. Responses are `cache-control: no-store`.

## Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `chain` | `string` | yes | A configured EVM network (`ethereum`, `base`, `arbitrum`, `optimism`, `polygon`, `bsc`, `avalanche`, `goat`). |
| `tokenAddress` | `string` | yes | The ERC-20 Votes token whose delegation events are read. |
| `governorAddress` | `string` | yes | The governor whose proposals and votes are read. Must differ from `tokenAddress`. |
| `delegates` | `string[]` | no | Up to 20 delegate addresses, each named once. Omit for the largest delegates seen in the range. |
| `fromBlock` | `number` | no | Defaults to `toBlock − 499,999`, floored at 0. |
| `toBlock` | `number` | no | Defaults to the chain head. The range may cover at most 500,000 blocks. |
| `topChanges` | `number` | no | How many of the largest delegation changes to rank, 1–25. Defaults to `10`. |

## Response

`200` with a `DelegateParticipationResult` whose `state` is `"ready"`; **`422`** with `state: "unsupported_governor"` and a `reason` when the governor does not emit the Governor events this feature reads; `503` with `state: "unavailable"` and a `reason` when the chain or the logs could not be read; `400` with `{ error, message }` for `invalid_json`, `invalid_request`, `malformed_response` or `provider_unavailable`; `413` for a body over 32,768 bytes; `429` when rate-limited; `500` with `participation_read_failed` for an unexpected failure, without provider detail.

```ts
type DelegateParticipationResult =
  | { state: "ready"; report: DelegateParticipationReport }
  | { state: "unavailable"; report: DelegateParticipationReport; reason: string }
  | { state: "unsupported_governor"; report: DelegateParticipationReport; reason: string };

type DelegateParticipationReport = {
  state: "complete" | "partial" | "unavailable";
  governance: { chain: string; chainId: number; tokenAddress: string; governorAddress: string };
  range: { fromBlock: number; toBlock: number; coversHistory: boolean };
  delegates: DelegateRow[];
  proposals: ProposalWindow[];
  largestChanges: DelegationChange[];
  coverage: string[];
  readOnly: true;
};

type DelegateRow = {
  address: string;
  currentPowerUnits: string | null;    // null when unknown from the scanned range
  peakPowerUnits: string | null;
  series: Array<{ blockNumber: number; powerUnits: string; deltaUnits: string; txId: string; txUrl: string }>;
  eligibleProposals: string[];         // snapshot block found this delegate holding power
  votedProposals: string[];
  undeterminedProposals: string[];     // eligibility not decidable from the range
  participationBps: string | null;     // null when no proposal was eligible
  state: "complete" | "partial";
  notes: string[];
};

type ProposalWindow = {
  proposalId: string;
  proposer: string;
  startBlock: number;                  // the governor's snapshot block
  endBlock: number;
  createdBlock: number;
  txId: string;
  txUrl: string;
  fullyInRange: boolean;
};

type DelegationChange = {
  delegate: string;
  blockNumber: number;
  previousPowerUnits: string;
  newPowerUnits: string;
  deltaUnits: string;                  // signed
  delegators: string[];                // from DelegateChanged in the same transaction
  txId: string;
  txUrl: string;
};
```

Power is reported in the token's own base units as exact integer strings — the feature reads no `decimals()` and formats no token amount. `participationBps` is an integer string in basis points (`5000` = 50.00%).
