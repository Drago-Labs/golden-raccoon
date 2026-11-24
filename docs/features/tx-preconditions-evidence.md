# Transaction preconditions — sources and limits

## Sources

- Envelope XDR supplied by the caller (classic or fee-bump).
- Horizon `GET /ledgers?order=desc&limit=1` for the newest closed ledger sequence and `closed_at`.
- Horizon `GET /accounts/{id}` for the source account `sequence`, `sequence_time` / `last_modified_time`, and `sequence_ledger` / `last_modified_ledger`.

## Evaluation rules (CAP-21)

- Time bounds: `minTime <= close_time <= maxTime` when the bound is non-zero.
- Ledger bounds: `minLedger <= ledger < maxLedger` when `maxLedger` is non-zero; otherwise only `minLedger` is checked.
- `minAccountSequence`: when set, `minSeqNum <= account.sequence < tx.seqNum`. When unset, `account.sequence` must equal `tx.seqNum - 1`.
- `minAccountSequenceAge`: `close_time >= account.seqTime + minSeqAge`.
- `minAccountSequenceLedgerGap`: `ledger >= account.seqLedger + minSeqLedgerGap`.
- Extra signers: every listed signer must have a matching signature hint on the inner envelope. Cryptographic verification of the signature payload is out of scope.

## Limits

- Request body and envelope XDR size bounds are enforced before decode.
- Provider calls time out and oversized responses are rejected.
- At most two extra signers are listed (the CAP-21 maximum).

## What is not claimed

- The tool never signs or submits.
- An unavailable Horizon response does not invent a ledger or sequence.
- Signature hint presence is reported; full cryptographic validation of every signature is not.
