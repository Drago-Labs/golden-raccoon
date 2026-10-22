# Domain evidence and limits

Registration age comes from RDAP, certificate history from public certificate-transparency search, and project-domain listing from configured `stellar.toml` or metadata. Every signal retains its source URL and observation time.

Provider failures remain **unknown**, never clean. CT entries prove certificate issuance, not current control. RDAP dates and public-suffix heuristics vary by registry. Metadata can be stale or compromised.
