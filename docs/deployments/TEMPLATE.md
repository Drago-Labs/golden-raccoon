# Audit Layer Deployment Record — <chain> / <network>

Fill one copy of this file per deployed network. The machine-readable half is
written by `scripts/deploy-audit-layer.mjs` to
`docs/deployments/<chain>-<network>.json`; this file is the human-readable
record that points at it.

> Do not paste a private key, secret seed, or signed XDR into this file, or into
> any file in this repository.

## Identity

| Field | Value |
|---|---|
| Chain | `evm` \| `soroban` |
| Network | |
| Contract | `GoldenRaccoonAudit` \| `AuditRegistry` |
| Interface version | |
| Contract address / id | |
| Deployment transaction | |
| Explorer link | |
| Deployer address (public) | |
| Deployed at (UTC) | |

## Source

| Field | Value |
|---|---|
| Commit SHA | |
| Working tree clean at deploy | yes / no |
| Artifact record | `docs/deployments/<chain>-<network>.json` |

A record whose commit does not describe the deployed source is not evidence. The
deploy script refuses to run against a dirty tree for this reason.

## Toolchain

| Field | Value |
|---|---|
| rustc | |
| cargo | |
| soroban-sdk | `=26.0.1` (pinned in `soroban/Cargo.toml`) |
| Stellar CLI | |
| Node.js | |
| Hardhat | |
| solc | `0.8.24` (pinned in `backend/contracts/hardhat.config.ts`) |

## Artifact hashes

| Field | Value |
|---|---|
| WASM SHA-256 (Soroban) | |
| Creation bytecode SHA-256 (EVM) | |
| ABI SHA-256 (EVM) | |

## Verification performed

Record what was actually checked, by whom, and what the output was. An unchecked
box is more useful than a checked one that nobody ran.

- [ ] Rebuilt from the recorded commit and toolchain; hash matches the record.
- [ ] On-chain code matches the rebuilt artifact
      (`stellar contract info --id <id>` / explorer source verification).
- [ ] `cargo test --manifest-path soroban/Cargo.toml` passes at the recorded commit.
- [ ] `npm --prefix backend/contracts test` passes at the recorded commit.
- [ ] Frontend bindings regenerated from the deployed contract and committed.
- [ ] A smoke transaction exercised authorize → log decision → revoke, and the
      emitted events match the documented shapes.

Verified by: _______________  Date: _______________

## Rollback

The contracts are not upgradeable. Rolling back means deploying a corrected
contract and repointing clients; the superseded address stays readable so its
history is not lost.

| Field | Value |
|---|---|
| Previous address / id, if any | |
| Client config key to repoint | |
| Users notified | yes / no / not applicable |

## Notes and known limitations


## Build Provenance
- [ ] Artifact provenance manifest generated via `npm run provenance:freeze`
- [ ] Offline provenance verification passed via `npm run provenance:verify`
- [ ] No secrets or credential-bearing URLs in manifest

## Build Provenance
- [ ] Artifact provenance manifest generated via `npm run provenance:freeze`
- [ ] Offline provenance verification passed via `npm run provenance:verify`
- [ ] No secrets or credential-bearing URLs in manifest

## Build Provenance
- [ ] Artifact provenance manifest generated via `npm run provenance:freeze`
- [ ] Offline provenance verification passed via `npm run provenance:verify`
- [ ] No secrets or credential-bearing URLs in manifest

## Build Provenance
- [ ] Artifact provenance manifest generated via `npm run provenance:freeze`
- [ ] Offline provenance verification passed via `npm run provenance:verify`
- [ ] No secrets or credential-bearing URLs in manifest
