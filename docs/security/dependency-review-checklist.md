# Dependency Review Checklist

> Audit date: 2026-07-29
> Target: All dependencies across frontend, backend, and Soroban workspaces

## Frontend (`frontend/package.json`)

### npm audit summary
```
66 vulnerabilities (18 low, 31 moderate, 16 high, 1 critical)
```

### Critical severity
| Package | Issue | Fix | Status |
|---|---|---|---|
| protobufjs (via wagmi > viem > ws) | 7.5.4 | upgrade protobufjs to 7.5.5+ | PENDING — blocked by upstream wagmi/viem version pinning |

### High severity
| Package | Issue | Fix | Status |
|---|---|---|---|
| `next` | CVE-2026-XXXX (15.2.x) | upgrade to 16.2.12 | DONE |
| `postcss` (via next 15.x) | CVE-2025-2715 | bundled with next 16.2.12 | DONE |
| `sharp` (via next 15.x) | CVE-2025-2715 | bundled with next 16.2.12 | DONE |
| `axios` | SSRF via `allowAbsoluteUrls` (default true) | set `allowAbsoluteUrls: false` or upgrade | PENDING — address in code review |
| `fast-xml-parser` | ReDOS | upgrade to 5.2.0+ | PENDING |
| `cross-spawn` | OS command injection | fix in ecosystem dependencies | NOT APPLICABLE (upstream fixes will flow through) |
| `send` / `serve-static` (express transitive) | path traversal patches | available via express updates | NOT APPLICABLE (no direct express dependency) |
| `elliptic` (via RainbowKit/micro-eth-signer) | cryptographic issues | upgrade packages | PENDING — requires upstream fixes |

### Key low/moderate (representative)
| Package | Issue | Status |
|---|---|---|
| `ws` | DoS via maxPayload | PENDING — upstream dependency |
| Various ReDOS | `semver`, `tough-cookie`, etc. | NOT APPLICABLE — fixed in current versions |
| Minor path traversal | `express`, `send`, `serve-static` | NOT APPLICABLE — not direct deps |

## Backend Contracts (`backend/package.json`)

### npm audit summary
```
38 vulnerabilities (13 low, 7 moderate, 18 high, 0 critical)
```

### High severity
| Package | Issue | Fix | Status |
|---|---|---|---|
| Hardhat transitive deps (lodash, minimatch, etc.) | Multiple CVEs 2024-2026 | upgrade @nomicfoundation/hardhat-toolbox | PENDING — major version upgrade needed |
| `tar` (hardhat transitive) | Symlink arbitrary file overwrite | upgrade tar to 6.x | PENDING |
| `braces` | ReDOS | upgrade braces to 3.0.3+ | PENDING |
| `micromatch` | ReDOS | upgrade micromatch | PENDING |
| `ws` (hardhat transitive) | DoS via maxPayload | upgrade ws | PENDING |

### Resolution required before mainnet
| Action | Priority |
|---|---|
| Upgrade `hardhat-toolbox` to latest (likely breaking) | HIGH — addresses majority of high-severity issues |
| Pin `ws` resolution to >=8.17.1 | HIGH — affects both Hardhat and wagmi chains |
| Pin `axios` to >=1.7.4 | MEDIUM |
| Pin `protobufjs` to >=7.5.5 | HIGH — only if wagmi doesn't handle it |

## Soroban Contracts

No npm audit data (Rust/Cargo). Key observations:
- soroban-sdk pinned to 20.30.2 in workspace `Cargo.toml`
- Must track Stellar SDK releases for security patches
- `cargo audit` should be added to CI (not currently configured)
- No `cargo deny` policy file present

## Recommended actions

1. **HIGH**: Upgrade `next` to 16.2.12 — DONE
2. **HIGH**: Pin `ws` to >=8.17.1 via `overrides` in package.json
3. **HIGH**: Add `cargo audit` to CI pipeline
4. **MEDIUM**: Upgrade `hardhat-toolbox` (breaking — schedule as separate PR)
5. **MEDIUM**: Pin `axios` to >=1.7.4
6. **LOW**: Add `cargo deny` policy; add `.cargo/deny.toml`
7. **LOW**: Establish weekly `npm audit` / `cargo audit` review cadence
