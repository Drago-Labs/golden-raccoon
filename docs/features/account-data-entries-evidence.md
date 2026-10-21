# Evidence used by account data entries

Sources:

- The account `data` map from Horizon. Values are base64. Missing keys are not invented.
- `manage_data` operations for that account: key (`name`), base64 `value` or null for a delete, source account, ledger, and paging token.
- The account `last_modified_ledger` is the observation point for the recent-window flag. It is not a claim that every entry changed in that ledger.
- The base reserve of 0.5 XLM per current data entry. Sponsorship and the account's other subentries are not added on top.

Limits:

- At most 5 operation pages, 200 records per page, and 1,000 manage_data operations.
- At most 100 keys are shown. A longer list is partial.
- Provider responses over 1,000,000 bytes are rejected.
- The recent window defaults to 30 ledgers and cannot exceed 500,000.

A truncated history names the oldest ledger present in the fetched pages. Older events are omitted, not reconstructed.

Out of scope: writing or deleting entries, signing, and explaining what a key means beyond the detected format.
