# Verified bytecode

Read-only comparison of deployed runtime bytecode and published verification metadata.

## Limits

- The app does not compile source and does not submit verifications.
- A partial Sourcify-style match is reported as partial, never as full.
- An unreachable verification source is unavailable, which is not the same as unverified.
- Immutable reference ranges are masked before the runtime comparison. Constructor arguments and library links are shown when the source publishes them.
- Proxy analysis is out of scope.
