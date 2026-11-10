# EVM TimelockController Inspector

Reads `CallScheduled`, `CallExecuted`, `Cancelled`, and `MinDelayChange` events, groups batched calls by operation ID in call index order, computes operation status (`pending`, `ready`, `done`, `cancelled`) at a recorded block, decodes known selectors, and summarizes role holders.
