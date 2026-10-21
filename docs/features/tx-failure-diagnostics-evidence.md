# Evidence used by failed-transaction diagnostics

The diagnosis is built only from these records:

- Transaction `envelope_xdr` and `result_xdr` for the requested hash and network.
- The fee charged in the result, not a fee reconstructed from the envelope.
- For a fee bump, the outer `tx_fee_bump_inner_failed` or `tx_fee_bump_inner_success` result and the inner transaction result, including its own fee.
- An account snapshot only when `observed_ledger` equals the transaction ledger. A current Horizon account is not treated as the state at failure.
- Native balance and the protocol base reserve of 0.5 XLM per base entry `(2 + subentry_count)`. Sponsorship and liabilities are not assumed when the snapshot does not include them.

Sequence evidence compares the recorded account sequence with the envelope sequence. The next accepted sequence is the recorded sequence plus one.

Unknown result codes are shown as returned. They are not mapped to a nearby known code.

Out of scope: submitting a replacement transaction, collecting signatures, and proving a cause that the recorded state does not contain.
