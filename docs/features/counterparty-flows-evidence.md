# Evidence used by counterparty flows

## Sources

- Horizon account payments (newest first) for classic payments and path payments.
- Horizon account operations for claimable-balance claims that include a recorded sponsor/counterparty.
- Optional identity directory entries supplied to the feature-local resolver. Labels without directory evidence are omitted.

## Limits

- At most 5 pages, 200 records per page, and 1,000 events per reader class.
- Windows cannot exceed 90 days.
- Provider responses over 1,000,000 bytes are rejected.
- Request bodies over 16,384 bytes are rejected.
- Reader timeout is 8 seconds.

## Fixture verification

Recorded fixtures under `frontend/tests/features/counterparty-flows/data/`:

- `exchange-heavy.json` — one labelled exchange receives 80 XLM out of 100 XLM outflow (top-1 = 4/5, HHI = 17/25).
- `diverse-flows.json` — multiple unlabelled peers across payment, path payment, and claim.
- `inactive-account.json` — zero events.
- `provider-unavailable.json` — every reader fails; report state is `unavailable`.

Hand check for exchange-heavy outflow: 80 + 20 = 100; top-1 share 80/100 = 4/5; Herfindahl (6400 + 400) / 10000 = 17/25.
