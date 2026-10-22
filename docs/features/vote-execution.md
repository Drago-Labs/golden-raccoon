# Vote execution reconciliation

The reconciler loads a bounded set of off-chain proposals and executor activity in an explicit block range. Declared payload target, calldata, and value are normalised and compared exactly. Results are classified as executed as approved, executed differently, not executed, executed without approval, or ambiguous.

The feature is read-only. It does not vote, queue, or execute. Proposals without declared executable payloads cannot be conclusively matched.
