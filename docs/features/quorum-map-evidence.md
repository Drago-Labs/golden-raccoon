# Evidence used by the quorum map

Sources, each stored with its name and fetch time:

- The configured validator directory. Pubnet uses `https://api.stellarbeat.io/v1`. Testnet uses `https://api.stellarbeat.io/v1/testnet`. A pubnet request is never sent to the testnet path.
- `https://{homeDomain}/.well-known/stellar.toml` for each directory home domain, up to 50 domains. Only `[[VALIDATORS]]` `PUBLIC_KEY` and `HOME_DOMAIN` are compared with the directory.

Limits:

- 500 nodes and a quorum-set depth of 8. A deeper set is truncated and the report is partial.
- Directory and toml responses over 2,000,000 bytes are rejected.
- A source older than 86,400 seconds is stale. Its age in seconds is shown. Stale or failed sources make the report partial.

Unknown validator keys are listed and are not dropped or assigned to an organization. A toml home domain that disagrees with the directory is a disagreement, not a corrected value.

The report's `provesSafety` field is always false. Threshold counts are not a quorum-intersection proof.

Out of scope: running a node, full intersection proofs, and validator recommendations.
