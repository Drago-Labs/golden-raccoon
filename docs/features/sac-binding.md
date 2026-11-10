# Stellar Asset Contract (SAC) Binding Verifier

## Deterministic Derivation

1. **Network ID**: Computes `SHA-256(networkPassphrase)`.
2. **Asset Preimage**: Serializes `HashIdPreimageContractId` with `ContractIdPreimageFromAsset(classicAssetXdr)` and `networkId`.
3. **Contract Address**: Hashes the XDR preimage with `SHA-256` and encodes the 32-byte hash as a Stellar `C...` StrKey address.
4. **Executable Check**: Confirms the ledger entry uses `CONTRACT_EXECUTABLE_STELLAR_ASSET` rather than `CONTRACT_EXECUTABLE_WASM`.
