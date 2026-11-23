# Privileged key evidence and limits

Sources are the privilege rows in the request. Those rows are the recorded output of an owner, role, or admin read on EVM and of an admin or upgrade-authority read on Soroban. The page does not contact a project.

A provider that does not answer is `{ "kind": "unavailable" }` with the reason. It is not shown as an empty key set.

Limits live in `PRIVILEGED_KEY_LIMITS`: 40 contracts, 80 privilege rows, 120000 bytes, and an 8 second read budget. Chains with no deployment are named in the coverage note.
