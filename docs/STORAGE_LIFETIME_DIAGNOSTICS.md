# Soroban storage lifetime diagnostics

The storage lifetime inspector accepts an explicit, bounded list of SDK-decodable ledger-key XDR values. It reads those keys from the configured Stellar RPC endpoint and never enumerates a contract's complete storage.

Each result records the single observed ledger, key kind, durability, live-until ledger, remaining ledgers, and an estimated wall-clock duration based on a documented five-second ledger cadence. An entry is live at its live-until boundary and past the boundary only after it.

Missing, unsupported, and unavailable evidence remain distinct. A missing RPC result does not prove that an entry is archived. Operators should review the evidence before using a separate trusted tool for restoration or TTL extension.

The API requires a wallet session, rejects a wallet/network mismatch, and validates duplicates, malformed XDR, cross-contract data keys, and footprint limits before contacting a provider. The feature contains no signing, restoration, extension, or submission path.
