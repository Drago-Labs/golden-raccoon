# EIP-7702 delegation inspection

The inspector reads an account's current bytecode and recognizes only the exact `0xef0100 || address` designator defined by EIP-7702. It decodes the 20-byte target, lists available authorization-list history, and derives plain-language capabilities only from known implementations or verified source. Unknown code is labelled unknown, never safe. The feature is read-only and cannot sign or revoke a delegation.
