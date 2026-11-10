# Cross-Contract Call Tree Tracer

## Reconstruction Rules

1. **Stack Reconstruction**: Pushes a new `CallTreeNode` on each diagnostic `fn_call` event and pops on `fn_return` or `fn_error`.
2. **Inner Failure Pinpointing**: Identifies the deepest node where execution trapped so users see which sub-invocation caused a revert.
3. **Transfer Attribution**: Attaches token transfer events to the active call frame and aggregates net token deltas per address.
