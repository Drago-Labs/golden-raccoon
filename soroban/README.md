# Golden Raccoon Risk Registry

Soroban contract for publishing tamper-evident Golden Raccoon risk records. Reports remain off-chain; the contract stores their SHA-256 digest, score, verdict, publisher, network and update time.

## Local verification

```sh
cargo fmt --manifest-path soroban/Cargo.toml --all -- --check
cargo clippy --manifest-path soroban/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path soroban/Cargo.toml
stellar contract build --manifest-path soroban/Cargo.toml
```

Deployment and initialization are handled by `scripts/stellar-deploy.sh`. Never commit a Stellar secret key. Generated WASM under `soroban/target/` must stay untracked.
