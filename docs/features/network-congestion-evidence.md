# Evidence and limits for ledger capacity

## Sources

The capacity numerator and denominator come from the Horizon ledger resource:

| Field | Use |
| --- | --- |
| `sequence` | Identity of the ledger. A hole between the requested ends is a gap. |
| `closed_at` | Close time used by timestamp lookup. |
| `tx_set_operation_count` | Operations admitted to the transaction set, including failed ones. |
| `max_tx_set_size` | Network maximum operations for that ledger. |
| `base_fee_in_stroops` | The base inclusion fee the surge floor is compared with. |

`operation_count` is only a fallback when `tx_set_operation_count` is absent. The transaction set size is the capacity the protocol fills.

Transaction fees come from the Horizon transaction resource for that ledger:

| Field | Use |
| --- | --- |
| `fee_charged` | Stroops actually charged. For Soroban this is inclusion plus resource, and it is split before it is shown. |
| `operation_count` | Divisor for the per-operation inclusion sample. |
| `successful` | Recorded on the transaction. A `false` value does not drop the fee. |
| `result_meta_xdr` | Required. Without it the fee is omitted, because a Soroban charge cannot be told from a classic one. |

Soroban components come from `SorobanTransactionMetaExtV1` inside transaction meta v3 or v4. The XDR comment in the protocol is the authority for the equation, also written up in `docs/features/network-congestion.md`:

- resource fee = non-refundable + refundable
- rent is a subset of the refundable component
- `feeCharged` = resource fee + inclusion fee

The Stellar SDK decodes that meta. This feature does not reimplement the fee schedule and does not estimate a resource fee from instructions or ledger writes.

## What is not evidence

- A fee recommendation, a simulation, or a prepared transaction. None of those are read or written.
- Soroban instruction limits, read/write byte budgets, or the ledger-wide Soroban resource pool. Fullness here is the operation-set capacity, which is what inclusion surge pricing fills. A ledger can be tight on Soroban resources while `tx_set_operation_count` is still under `max_tx_set_size`. This view does not infer that second condition.
- A fiat conversion. Fees stay in stroops.
- A single "network fee" that adds classic inclusion to a Soroban resource fee. That sum is not computed.

## Limits

Published on `CONGESTION_LIMITS`:

| Bound | Value | Why |
| --- | --- | --- |
| Ledgers per window | 240 | About twenty minutes at a five-second close. |
| Ledger page size | 50 | Horizon page size for the sequence walk. |
| Transactions per ledger | 200 | Caps one very large ledger. |
| Transaction pages | 4 | Stops a cursor that never ends. |
| Timeout | 8 seconds | One provider call. |
| Request body | 8192 bytes | The window description is small. |
| Lookup radius | 20, default 4 | Sequences on either side of a match. |
| Timestamp probes | 24 | Binary search plus a boundary check. |
| Search slack | 50,000 ledgers | Room for a close that is slower or faster than five seconds, still bounded. |

Past the transaction cap the window is `truncated` and coverage is partial. The missing tail is not treated as zero.

The Horizon host is the project's configured data API for `stellar-pubnet` or `stellar-testnet`. The request cannot substitute a URL. Redirects are rejected. A passphrase on the read that does not match the requested network aborts the report.

## Recorded windows

`frontend/tests/features/network-congestion/data/` holds four recorded responses:

| File | What it fixes |
| --- | --- |
| `quiet-window.json` | Under-capacity ledgers, a classic inclusion fee, and a Soroban resource fee that must not be added to it. |
| `surge-window.json` | Three full ledgers, a failed-but-included classic transaction, and separate percentile series. |
| `ledger-gap.json` | Sequence 302 absent. The mean is 8000 basis points, not the 6400 that a zero-filled hole would produce. |
| `provider-unavailable.json` | HTTP 503. The service throws `provider_unavailable` and returns no zeroed report. |

The passphrase in the ledger fixtures is the public-network passphrase. Tests compare it with `Networks.PUBLIC`.

## Checking a live window

1. Request a short public range, no more than a handful of ledgers.
2. Open the same sequences in a block explorer.
3. Compare `closed_at`, `tx_set_operation_count`, `max_tx_set_size`, and each transaction's `fee_charged`.
4. For a Soroban transaction, decode `result_meta_xdr` and recompute resource and inclusion with the equation above. The two results stay in different columns.
5. If a sequence is absent from the response, confirm the page shows it as a gap and that the percentile sample count did not grow.

No funds, keys, or paid services are required for the fixture suite.
