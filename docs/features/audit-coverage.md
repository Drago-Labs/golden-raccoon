# Audit coverage

Add an audit record with the auditor, date, report URL, report hash, commit, and in-scope contracts.

The report is intact only when the stored hash equals the provided digest. A deployed contract is covered when its code hash matches the audited build, or when no hash exists and the commit matches. A different code hash is changed-since-audit. A contract with no hash and no commit is unknown, not covered. Findings stay at the published severity and resolution.
