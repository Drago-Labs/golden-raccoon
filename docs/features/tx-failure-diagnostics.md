# Failed transaction diagnostics

This page explains why a Stellar transaction failed. It reads the result XDR and, when a snapshot was recorded for the same ledger, the account state that existed there.

The transaction code and each operation code are shown separately. A successful operation result that sits before the failing code would have succeeded on its own. The first failing code is the operation that aborted the transaction. Envelope operations with no result code were not attempted. `tx_bad_seq`, `tx_too_late`, and `tx_insufficient_fee` fail before any operation runs, so they are not described as operation aborts.

A fee-bump transaction keeps two results: the outer wrapper and the inner transaction, including the fee charged on each.

If historical account state is missing, the report is partial. The missing balance or sequence is left empty. The page does not invent a cause to fill that gap. If the transaction record itself cannot be loaded, the report is unavailable and no result code is guessed.

The page does not sign, retry, or rebuild the transaction.
