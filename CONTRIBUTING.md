# Contributing to Golden Raccoon

## Table of contents

1. [Code of conduct](#code-of-conduct)
2. [Required toolchain](#required-toolchain)
3. [Quick start](#quick-start)
4. [Local quality gate](#local-quality-gate)
5. [Project structure](#project-structure)
6. [Architecture overview](#architecture-overview)
7. [Contributor workflow (Drips Wave)](#contributor-workflow-drips-wave)
8. [Scope of work](#scope-of-work)
9. [Pull request standards](#pull-request-standards)
10. [Issue and PR templates](#issue-and-pr-templates)
11. [Definition of done](#definition-of-done)
12. [Security](#security)

---

## Code of conduct

All contributors must abide by the [Code of Conduct](CODE_OF_CONDUCT.md).
Harassment, trolling, and inappropriate behaviour are not tolerated.

---

## Required toolchain

Golden Raccoon uses Node.js for the Next.js application and Rust for Soroban
contracts.

| Tool            | Minimum version | Notes |
|-----------------|-----------------|-------|
| Node.js         | 22              | Also needs npm ≥ 10 |
| npm             | 10              | Comes with Node 22+ |
| Rust (stable)   | 1.84            | `wasm32v1-none` first available in 1.84 |
| Stellar CLI     | 26.1.x          | For mainnet Protocol 26 builds |
| Soroban SDK     | 26.0.1          | Pinned in `soroban/Cargo.toml` |

### Install the contract toolchain (macOS / Linux)

```sh
rustup toolchain install stable
rustup target add wasm32v1-none
cargo install --locked stellar-cli --version 26.1.0
```

On macOS, Homebrew may also install Stellar CLI (`brew install stellar-cli`),
but the Homebrew version tracks the latest release and can move ahead of
mainnet. Prefer the `cargo install` route above.

### Verify versions

```sh
node --version
npm --version
rustc --version
stellar --version
```

> **Note:** When both Homebrew Rust and rustup are installed, force Stellar CLI
> to use the rustup compiler that owns the WASM target:
>
> ```sh
> RUSTC="$(rustup which rustc)" stellar contract build --manifest-path soroban/Cargo.toml
> ```

---

## Quick start

```sh
# 1. Install frontend dependencies
npm install
npm install --prefix frontend

# 2. Copy environment template and fill in your keys
cp .env.example frontend/.env.local

# 3. Run the quality gate
npm run quality:gate

# 4. Run Soroban contract tests
cargo test --manifest-path soroban/Cargo.toml

# 5. Build Soroban WASM (optional, for contract work)
RUSTC="$(rustup which rustc)" stellar contract build --manifest-path soroban/Cargo.toml

# 6. Start the development server
npm run dev --prefix frontend
```

---

## Local quality gate

Before opening a pull request, **run the full quality gate** from the project
root:

```sh
npm run quality:gate
```

This runs:

| Step               | Command                                                  |
|--------------------|----------------------------------------------------------|
| Lint (frontend)    | `npm run lint --prefix frontend`                         |
| TypeScript check   | `npx -p typescript@5.7 tsc --noEmit --prefix frontend`  |
| Index check        | `npx tsx frontend/scripts/agent-fixture-check.ts`        |
| Stellar config     | `npx tsx scripts/check-stellar-rpc.mjs`                 |
| Deploy readiness   | `npx tsx scripts/check-deploy-readiness.mjs`             |
| Smoke API          | `npx tsx scripts/smoke-api.mjs`                          |

> **Important:** The quality gate must pass in CI before a PR can be merged.
> If a change genuinely breaks the gate for a good reason (e.g., a new required
> env var), document it in the PR body.

---

## Project structure

```
golden-raccoon/
├── frontend/                  # Next.js application (all product code)
│   ├── src/
│   │   ├── app/               # Next.js App Router pages + API routes
│   │   ├── components/        # React components (AppShell, Dashboard, etc.)
│   │   ├── hooks/             # React hooks (useWalletSession)
│   │   ├── lib/               # Client-safe utilities (chains, identity, format)
│   │   ├── providers/         # React context providers (Web3, Stellar wallet)
│   │   └── server/            # Server-only code (agents, storage, providers)
│   │       ├── agents/        # AI agents (portfolio, news, social, onchain, decision, execution)
│   │       ├── providers/     # Provider adapters (quote, portfolio, onchain)
│   │       ├── stellar/       # Stellar-specific modules (swap, trustline, risk registry)
│   │       ├── env/           # Runtime mode + env validation
│   │       ├── security/      # Policy, rate limit, input validation
│   │       ├── storage/       # Storage adapter (memory, Supabase)
│   │       └── x402/          # x402 payment guards
│   │── scripts/               # Fixture checks, config validation
│   └── package.json
├── soroban/                   # Soroban smart contracts (Rust)
│   ├── contracts/
│   │   └── risk-registry/     # Risk Registry contract
│   └── scripts/               # Deployment scripts
├── backend/contracts/         # EVM smart contracts (Ethereum)
│   └── contracts/
│       └── GoldRaccoonVault.sol
├── scripts/                   # Root deployment + monitoring scripts
├── docs/                      # Documentation
│   └── CHAIN_CAPABILITY_MATRIX.md
├── .github/                   # GitHub templates
│   ├── ISSUE_TEMPLATE/        # Bug report + feature request forms
│   └── PULL_REQUEST_TEMPLATE.md
└── package.json               # Root workspace scripts
```

---

## Architecture overview

### Chain families

| Family   | Networks                                 | Quote provider     | Transaction model              |
|----------|------------------------------------------|--------------------|--------------------------------|
| **EVM**  | Ethereum, Base, BSC, Arbitrum, Polygon…  | DexScreener (V2)   | User-wallet-signed tx (EIP-1559) |
| **Stellar** | Stellar Testnet, Stellar Pubnet        | Horizon path-finding (V2) | User-wallet-signed (classic ops or Soroban) |

### Agent pipeline

```
User input
    ↓
[Contract / Onchain Agent] → scores contract risk
[Social Agent]             → scores social trust + hype
[News Agent]               → scores news sentiment + risk
[Portfolio Agent]          → scores wallet exposure (if connected)
    ↓
[Decision Agent]           → deterministic verdict
    ↓
[Execution Agent]          → approval-only trade plan (no auto-execute)
```

### Key constraints

- **Server never signs.** All blockchain transactions require explicit wallet
  signing by the connected user. The server prepares, previews, and verifies —
  but never holds or uses a user private key.
- **Approval-only.** Auto-execute is disabled at every level. Every onchain
  action goes through the user's wallet confirmation dialog.
- **No mock data in production.** In `live` mode, unavailable providers return
  `"unavailable"` status instead of fabricated data.
- **No risk guarantee.** Risk scores are informational indicators, not financial
  advice. See the [README](README.md) disclaimer.

---

## Contributor workflow (Drips Wave)

> Golden Raccoon is delivered through **Drips Wave** bounties. The workflow
> ensures every contribution is scoped, assigned, and independently verifiable.

### Step 1: Issue assignment

1. Browse the **Issues** tab for `help wanted` or `drips-wave` labelled issues.
2. Comment on the issue expressing interest. Do **not** start work before a
   maintainer assigns the issue to you.
3. Wait for the maintainer to **assign** the issue and confirm scope.
4. Once assigned, you may begin work.

### Step 2: Before writing code

1. Read the issue carefully — especially **Scope**, **Out of scope**, and
   **Acceptance criteria**.
2. Fork the repository (or pull the latest upstream `main`).
3. Create a branch named `feat/<short-description>` or `fix/<short-description>`.
4. Run the [quality gate](#local-quality-gate) once on the base branch to
   confirm your environment is set up correctly.

### Step 3: Code

1. Make focused, scoped commits. Each commit should represent a logical change.
2. Write or update **fixtures** for new agent/provider behaviour.
3. Run the [quality gate](#local-quality-gate) locally before pushing.

### Step 4: Pull request

1. Push your branch and open a pull request against `upstream main`.
2. Use the [PR template](.github/PULL_REQUEST_TEMPLATE.md) and fill in every
   section.
3. Link the issue with `Closes #N` in the PR body.
4. Request review from a maintainer.
5. Respond to review feedback within **3 business days** or the PR may be
   unassigned.

### Step 5: Merge

1. The PR must pass CI (quality gate + contract compile).
2. A maintainer approves and merges.
3. The issue auto-closes via the `Closes #N` keyword.

---

## Scope of work

### In scope for contributions

- Bug fixes, test improvements, documentation corrections.
- New provider adapters behind the existing interface.
- Fixtures for new agent behaviour.
- Contract hardening and test coverage.
- Deployment scripts (without secrets).
- Issue templates, PR templates, and documentation.

### Out of scope

- Choosing or changing the open-source license or security contact without
  maintainer approval.
- Publishing secrets, API keys, or production credentials.
- Rewriting core agent logic without a corresponding issue.
- Adding auto-execute / auto-trading functionality. **All execution is
  approval-only.**

---

## Pull request standards

### Branch naming

```
feat/<short-description>   — new feature
fix/<short-description>    — bug fix
docs/<short-description>   — documentation
chore/<short-description>  — maintenance, tooling, CI
```

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(agent): add XYZ provider adapter
fix(stellar): correct trustline reserve calculation
docs: add deployment guide
```

### PR size

Prefer small, focused PRs:

- **Good:** 1–10 files, single logical change.
- **Acceptable:** 10–20 files, tightly related.
- **Avoid:** 20+ files touching unrelated modules. Split into multiple PRs.

### Review response

After a review is requested:

- Address feedback within **3 business days**.
- If you cannot address feedback in time, comment on the PR with an ETA.
- Stale PRs (no activity for 14 days) may be closed and the issue reassigned.

---

## Issue and PR templates

This repository ships YAML-based issue forms and a PR template in
`.github/`. When you open a new issue or PR, GitHub renders the form
automatically. Every template requests:

- **Problem / scope** — what needs to change and why.
- **Acceptance criteria** — measurable conditions for Done.
- **Verification** — commands or steps to confirm the change works.
- **Chain impact** — which chain families (EVM, Stellar) are affected.
- **Security considerations** — does the change affect trust boundaries.

Always fill out every section. Skipping sections delays review.

---

## Definition of done

A contribution is considered **Done** when:

1. All **acceptance criteria** from the issue are met.
2. The [quality gate](#local-quality-gate) passes locally.
3. If the change adds new behaviour, corresponding **fixtures** exist.
4. If the change touches Stellar or EVM execution, quote/transaction flow is
   still approval-only.
5. New environment variables are documented in `.env.example`.
6. The PR body is complete and links the issue with `Closes #N`.
7. CI passes on the PR branch.
8. A maintainer has approved the PR.

---

## Security

- **Never commit** a Stellar secret key, signed XDR, provider API key, wallet
  seed, or production credential.
- User transactions must be signed only by the connected wallet.
- Report security vulnerabilities via [SECURITY.md](SECURITY.md) — do **not**
  open a public issue.

---

_Thank you for contributing to Golden Raccoon!_ 🦝
