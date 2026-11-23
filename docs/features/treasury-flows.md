# Treasury flows

Declared treasury addresses come from the project registry payload, each with the source that published it. Balance history is the list of recorded checkpoints, sorted by time. The tracker does not invent a balance between checkpoints.

An outflow is categorized only when its label is `exchange`, `multisig`, or `contract`. Any other label, including a missing one, stays `unknown`.

A reported figure is compared with the latest checkpoint for the same asset and chain. The comparison keeps the URL that published the figure. A difference is a mismatch, not a judgement of the treasury.
