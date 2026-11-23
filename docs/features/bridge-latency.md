# Bridge latency

Sends and deliveries are matched by message id. Latency is `deliveredAt - sentAt` in seconds.

Percentiles use nearest rank: sort ascending, then take the value at `ceil(p/100*n) - 1`.

A send with no delivery whose age is greater than `stuckAfterSeconds` is stuck. The list includes the source transaction.

`format: "unrecognized"` on the payload, or any send whose format is not `standard`, is `{ "kind": "unknown_format" }`. The monitor does not retry or relay a message.
