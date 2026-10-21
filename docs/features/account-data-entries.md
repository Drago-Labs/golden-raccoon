# Account data entries

This page reads the `manageData` entries on a Stellar account and the `manage_data` operations that wrote them.

Each current value is base64-decoded to bytes. The page always shows the hex. It shows UTF-8 only when the bytes are valid, printable text. A value is then classified as an account id, contract id, URL, 32-byte or 64-hex hash, other text, or binary. The classification does not say what the entry means.

History is a bounded, cursor-paged read of `manage_data` operations. Duplicate paging tokens are ignored. The walk is oldest to newest: the first value is a set, a different later value is a change, and a null value is a delete. A delete keeps the previous value. If the fetched pages stop early, the report is partial and names the oldest ledger reached.

A key is recent when its newest fetched event is inside the requested ledger window. Format changed is set when two stored values for that key have different detected formats.

Each current entry costs one base reserve (0.5 XLM) before sponsorship. Deleted keys are not included in that total.

The page does not write entries or sign.
