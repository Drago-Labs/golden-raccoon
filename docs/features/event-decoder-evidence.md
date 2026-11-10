# Soroban Event Decoder — Sources and Limits

- Events outside the RPC node's retention window (`startLedger < earliestRetainedLedger`) are reported as unavailable rather than absent.
