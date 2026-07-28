# Contributing to Golden Raccoon

## Required toolchain

Golden Raccoon uses Node.js for the Next.js application and Rust for Soroban contracts.

- Node.js 22 or newer (CI pins Node 22).
- npm 10 or newer.
- Rust 1.85.0 via root `rust-toolchain.toml` (1.84 or newer is required for `wasm32v1-none`).
- Stellar CLI 26.1.x for a mainnet Protocol 26 release build. A newer CLI may be used for Protocol 27 testnet work after compatibility is verified.
- Soroban SDK exactly `26.0.1`, pinned in `soroban/Cargo.toml` for current mainnet compatibility.

Install the contract toolchain on macOS:

```sh
rustup show
rustup target add wasm32v1-none
cargo install --locked stellar-cli --version 26.1.0
```

Homebrew may also install Stellar CLI, but `brew install stellar-cli` follows the newest release and can move ahead of mainnet. Check all versions before building:

```sh
node --version
npm --version
rustc --version
stellar --version
```

If both Homebrew Rust and rustup are installed, force Stellar CLI to use the rustup compiler that owns the WASM target:

```sh
RUSTC="$(rustup which rustc)" stellar contract build --manifest-path soroban/Cargo.toml
```

## Installation and verification

```sh
npm ci
npm ci --prefix frontend
npm run quality:gate
cargo test --manifest-path soroban/Cargo.toml
RUSTC="$(rustup which rustc)" stellar contract build --manifest-path soroban/Cargo.toml
```

Never commit a Stellar secret key, signed XDR, provider credential, or production wallet seed. User transactions must be signed only by the connected wallet.

## CI quality gates

Pull requests and pushes to `main` run `.github/workflows/ci.yml`. CI uses committed lockfiles (`npm ci`), pinned Node 22, Rust 1.85.0 with `wasm32v1-none`, and Stellar CLI 26.1.0. It does not require production secrets, and it does not commit or cache generated `.env`, `.next`, Hardhat artifacts, or Soroban WASM output.

Local equivalents for each CI job:

### `app-quality`

Matches `npm run quality:gate` (deploy readiness, Stellar config tests, agent fixtures, TypeScript, ESLint, production Next.js build):

```sh
npm ci
npm ci --prefix frontend
npm run quality:gate
```

### `evm-contracts`

```sh
npm ci --prefix backend/contracts
npm run compile --prefix backend/contracts
npm test --prefix backend/contracts
```

### `soroban`

```sh
cargo fmt --manifest-path soroban/Cargo.toml --all -- --check
cargo clippy --manifest-path soroban/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path soroban/Cargo.toml
RUSTC="$(rustup which rustc)" stellar contract build --manifest-path soroban/Cargo.toml
```

### `api-smoke`

Build and start the app with a safe local test configuration (no production credentials), then run smoke checks:

```sh
export APP_MODE=test
export NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
export GOAT_RPC_URL=https://rpc.goat.network
export NEXT_PUBLIC_GOAT_RPC_URL=https://rpc.goat.network
export X402_PAY_TO=0x000000000000000000000000000000000000dEaD
export X402_PRICE_USD='$0.01'
export X402_NETWORK=eip155:84532
export X402_FACILITATOR_URL=https://x402.org/facilitator
export X402_ASSET=USDC
export SMOKE_BASE_URL=http://127.0.0.1:3000

npm ci
npm ci --prefix frontend
npm run build
npm run start &
# wait until http://127.0.0.1:3000/api/health responds
npm run smoke
```

`npm run quality:gate:full` runs the app quality gate plus smoke against an already running server (`SMOKE_BASE_URL`).
