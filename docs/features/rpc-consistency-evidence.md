# Horizon and RPC consistency — sources and limits

## Sources

Horizon, one network at a time:

- `GET /` for `history_latest_ledger`, `history_elder_ledger`, and `network_passphrase`
- `GET /accounts/{id}` for sequence, native balance, trustlines, and `last_modified_ledger`

The account resource is one document. Horizon does not paginate balances and
does not attach a ledger to each balance. Every Horizon field from that
document therefore carries the document ledger.

Stellar RPC, the same network:

- `getLatestLedger` for the provider tip (`sequence`)
- `getNetwork` for the passphrase, and for `ledgerRetentionWindow` when a server sends it
- `getEvents` with `pagination.limit` 1 at the latest ledger, only to read `oldestLedger` and `latestLedger`
- `getLedgerEntries` for the account key, trustline keys, and contract-data keys

The `xdr` field on each entry is `LedgerEntryData`. The ledger number for that
entry is the sibling `lastModifiedLedgerSeq`, not a header inside the XDR.

No method in this check submits a transaction.

## Contract data

Horizon does not expose Soroban contract data entries. The RPC side reads
them with `getLedgerEntries`. Those rows are single-source unless a recorded
Horizon equivalent is supplied to the classifier. The production Horizon probe
sets `contractDataExposed` to false and returns no entries.

Trustline keys are not enumerable on RPC. The first read asks for trustlines
named on the request. If Horizon then returns further trustlines, one follow-up
`getLedgerEntries` asks RPC for those keys. A trustline RPC does not return
stays single-source from Horizon.

## Units

Horizon prints decimal amounts with up to seven fractional digits. RPC prints
stroops as integers. Normalisation converts Horizon amounts with integer
arithmetic (`whole * 10_000_000 + fraction`). A value with more than seven
fractional digits is not comparable. Sequence numbers are canonical decimal
integers, so leading zeros do not cause a conflict.

## Bounds

Defined in `limits.ts`:

| Bound | Value | Effect |
| --- | --- | --- |
| Request body | 32_768 bytes | Rejected before the probes run |
| Probe timeout | 8 seconds | That provider becomes unavailable |
| Trustlines | 50 | Further trustlines are omitted and counted |
| Contract keys | 20 | Further keys are omitted and counted |
| RPC pages | 4 pages of 20 keys | Further keys are omitted and counted |

Omitted counts appear on the coverage notice. They are not treated as zero
values.

## Retention

A retention window is reported only when the provider sent one. Horizon's
window is `history_elder_ledger` through `history_latest_ledger`. RPC's window
is `oldestLedger` through `latestLedger` when `getEvents` returns those fields.
If neither call reports a start ledger, the status says the window was not
reported. The check does not invent a retention length.

## Networks

Testnet and mainnet use different passphrases and different hosts. A response
whose passphrase or host belongs to the other network is `network_mismatch`,
not a field conflict. Fixture files are testnet recordings. Tests that need
mainnet assert the host, they do not send the recording to mainnet.

## What the fixtures are

`frontend/tests/features/rpc-consistency/data/` holds four recorded provider
states:

- `matched-account.json` — same ledger, same canonical values
- `lagging-provider.json` — different ledgers and different values
- `conflicting-values.json` — same ledger, different native balance, both raw values kept
- `provider-unavailable.json` — Horizon timed out, RPC answered

Service and component tests inject these states. They do not open a socket.
Probe tests use an in-process fetch double and locally built XDR.
