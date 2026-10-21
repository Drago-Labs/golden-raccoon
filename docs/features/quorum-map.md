# Validator quorum map

This page shows how declared validator quorum sets depend on organizations. It is dependency evidence. It does not prove quorum intersection, and it does not say the network is safe.

A directory snapshot supplies each node's public key, organization, home domain, and quorum set, with the source name and fetch time. Each home domain's stellar.toml `[[VALIDATORS]]` table is read the same way. A node key that appears in a quorum set and not in the directory stays on the page as unresolved.

A nested quorum set agrees when the number of agreeing validators plus the number of agreeing inner sets reaches its threshold. An organization is counted once for each top-level set whose tree names it. Removing it breaks that set when the set no longer reaches its threshold with that organization's validators excluded. Unresolved keys are not assigned an organization, so they still count as agreeing when a named organization is removed.

If a source is older than one day, or a toml fetch failed, the report is partial and the age is shown. A home domain that differs between the node record and stellar.toml is flagged. Neither case is turned into a safety claim.

Out of scope: running a node, proving quorum intersection, and recommending validators.
