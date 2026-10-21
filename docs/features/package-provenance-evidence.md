# Package provenance inspector — sources and limits

## Data sources

- `registry.npmjs.org` — package metadata (versions, maintainers,
  lifecycle scripts, declared repository) and the per-version publish
  attestations endpoint (`/-/npm/v1/attestations/<name>@<version>`).
- `crates.io` — crate metadata (versions, publish time, declared
  repository, embedded Trusted Publishing data).
- `api.github.com` — tags for the declared repository, only when that
  repository resolves to a `github.com` owner/repo.
- No other third-party API, database, or paid provider is used.

## Fetch safety

Every fetch (and every redirect hop) is checked against
`server/security/urlSafety.ts`'s `assertExternalFetchAllowed`, plus a DNS
resolution check so a hostname that resolves to a private address after
the safety check still gets blocked (DNS-rebinding protection). See
`npmRegistry.ts`, `cratesRegistry.ts`, and `tagMatching.ts`. Unlike
`policy-changes`, the host for the npm and crates.io fetches is never
caller-supplied — only the package name is, and it is validated by
`packageIdentity.ts` before being interpolated into a fixed-host URL. The
GitHub tags fetch is the only one whose target is partly caller-influenced
(the package's declared repository), which is why it is restricted to
`github.com` and nothing else.

| Bound | Value |
| --- | --- |
| Fetch timeout | 6,000 ms |
| Max redirects | 3 |
| Max response size | 5,000,000 bytes |
| Max releases inspected per request | 15 |
| Max npm attestation fetches per request | 5 (the newest inspected releases) |
| Max GitHub tag pages fetched | 2 (200 tags) |
| Max maintainer changes reported | 50 |
| Max install-script changes reported | 50 |
| Max request body size | 16,384 bytes |

## Registry capability gaps are reported as unknown, not assumed absent

- **crates.io exposes no per-version maintainer snapshot.** The registry's
  `owners` endpoint is a current-state list with no history, so this tool
  cannot diff maintainers release-to-release for crates.io packages.
  Every crates.io release has `maintainers: null`, and no maintainer
  change is ever reported for a crates.io package — not because none
  occurred, but because the registry does not expose the history needed
  to check.
- **crates.io has no equivalent of npm lifecycle scripts in its registry
  API.** Every crates.io release has `lifecycleScripts: null` for the same
  reason.
- **A declared repository not on `github.com`** (GitLab, a bare git URL,
  no repository at all) makes tag matching report `unknown` for every
  release, with a note explaining why — this tool never fetches an
  arbitrary host to check tags.

## Provenance verdicts

| Verdict | Meaning |
| --- | --- |
| `verified` | A build provenance attestation (npm) or Trusted Publishing record (crates.io) was present and decoded. |
| `unverified` | The registry had no provenance data for this release — the common case for most released packages, not itself a red flag. |
| `unavailable` | The provenance check could not run: the attestation fetch failed, or this release was beyond the per-request attestation-check budget. |
