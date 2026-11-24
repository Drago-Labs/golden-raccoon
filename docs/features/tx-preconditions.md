# Transaction preconditions

This page explains CAP-21 preconditions on a pasted Stellar transaction envelope. It decodes time bounds, ledger bounds, minimum account sequence, sequence age, sequence ledger gap, and extra signers, then compares each rule to the current ledger number, close time, and source account sequence.

Fee-bump wrappers are unwrapped so the inner transaction's preconditions are the ones that are evaluated. The fee source is reported separately and is never treated as the sequence source.

The earliest and latest valid submission windows are computed from the intersecting constraints. When a side is unbounded it stays empty. When ledger state cannot be loaded, the envelope is still decoded and the report is labelled unavailable or partial. Missing evidence is never replaced with a guessed close time or sequence.

The page does not sign, submit, or construct an envelope.
