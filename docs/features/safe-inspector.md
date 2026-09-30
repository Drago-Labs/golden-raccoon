# Safe inspector

Read-only view of a Safe smart account.

## Supported versions

- Singleton `0x0000000000000000000000000000000000000001` is treated as Safe 1.3.0.
- Singleton `0x0000000000000000000000000000000000000002` is treated as Safe 1.4.1.
- Any other address is unsupported. It is not reported as safe.

Enabled modules are threshold-bypass paths. Unknown modules and guards stay unreviewed. The inspector does not propose or sign transactions.
