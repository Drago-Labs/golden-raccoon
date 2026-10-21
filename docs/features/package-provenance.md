# Package provenance inspector

## Why this exists

Users and integrators install a project's SDK on trust. A maintainer
takeover, a release built outside CI, or a new install-time script is a
supply-chain risk visible in registry metadata — but rarely checked. This
tool reads that metadata and reports it as **evidence**, never as a safety
verdict.

## The rule that shapes the output

**A missing attestation is a gap in evidence, not proof of compromise.**
Most released packages — including entirely legitimate ones — have no
build provenance attestation at all; npm provenance and crates.io Trusted
Publishing are both opt-in. An `unverified` release means the registry had
no provenance data to show, not that the release is suspect. An
`unavailable` release means a fetch failed and the check could not run at
all. Every report carries `supplyChainVerdict: null` so no code path can
turn this evidence into a judgment about whether a package is safe to
install.

## What it inspects

| Input | Evidence |
| --- | --- |
| A package name on npm or crates.io | Bounded registry read: versions, publish times, declared repository |
| Build provenance | npm publish attestations (SLSA provenance predicate) or crates.io Trusted Publishing data, decoded for source repository, workflow, and commit |
| Maintainers | Per-version maintainer snapshots on npm, diffed release-to-release (crates.io exposes no equivalent history — see `package-provenance-evidence.md`) |
| Install-time scripts | `preinstall`/`install`/`postinstall` entries on npm, flagged only when they first appear in a release |
| Tag history | The declared repository's GitHub tags, matched against each inspected release version |

## No session history needed

Unlike the diff-against-history features in this app (`policy-changes`,
`metadata-integrity`), this inspector needs no caller-held prior snapshots.
Both registries already return full version history on every request, so
`maintainerDiff.ts` and `installScripts.ts` diff across that one response
and every check is a fresh, self-contained report.

## Fetch surface stays narrow

This tool only ever reads from three fixed hosts: `registry.npmjs.org`,
`crates.io`, and `api.github.com`. A package's declared repository is only
fetched from if it resolves to a `github.com` owner/repo — any other host
is reported as `unknown` tag coverage, never fetched. This keeps the
feature from becoming a general-purpose URL fetcher just because a
package author put an arbitrary string in their `repository` field.

## Non-obvious decisions

- **crates.io needs no second fetch for provenance.** npm's publish
  attestations live at a separate per-version endpoint, so this tool
  fetches it for a bounded number of the most recent releases. crates.io
  embeds Trusted Publishing data directly in the crate response this tool
  already read, so no extra request is made.
- **Attestation checks are budgeted, not exhaustive.** Only the newest
  `PACKAGE_PROVENANCE_LIMITS.maxAttestationFetches` npm releases get a
  provenance fetch; older inspected releases are reported `unavailable`
  with a note that explains this is a budget limit, not a failed check.
- **A long-standing install script is not flagged.** `installScripts.ts`
  only reports a lifecycle script that is new in a release compared to the
  one before it — a script present since the first inspected release is a
  different risk profile than one added partway through a package's
  history, and is left for the release list itself to show.
