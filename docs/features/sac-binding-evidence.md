# SAC Binding Verifier — Sources and Limits

- A Wasm contract with copied `name`, `symbol`, and `decimals` is flagged as `lookalike_wasm` (`isGenuineSac: false`).
- An undeployed SAC is reported as derivable (`undeployed_sac`) with its deterministic address.
