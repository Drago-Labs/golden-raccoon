# Alert rule lab

The rule lab deterministically evaluates one draft and an optional saved rule against at most 100 wallet- and network-scoped observations. It uses inclusive high/low threshold boundaries, hysteresis recovery, active-alert deduplication and cooldown after recovery.

The replay sorts input by observation time, exposes missing and out-of-order evidence, freezes the report clock and never calls alert storage, delivery, acknowledgement, rule-write or scheduler code. Results are previews and do not approve or save a rule.

Focused command: npx vitest run tests/features/alert-rule-lab
