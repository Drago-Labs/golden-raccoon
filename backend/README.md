# Backend Contracts

## Contracts
- `GoldRaccoonPolicy.sol`: Policy enforcement contract on EVM.
- `GoldRaccoonVault.sol`: Execution vault contract.
- `GoldRaccoonRiskRegistry.sol`: Onchain risk registry.

## Reproducible Builds & Artifact Provenance
Contracts are compiled with deterministic Solidity compiler settings (`Solidity 0.8.24`, `viaIR: true`, `optimizer: 200 runs`, `evmVersion: paris`).

To build contracts and generate a provenance manifest:
```bash
npm run build:evm
npm run provenance:freeze
npm run provenance:verify
```
