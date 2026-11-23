# Privileged key inventory

The inventory is read-only. It takes the deployment list a project registry already stored and the privilege rows read for those contracts. It does not send a transaction and it does not guess a custody type.

## Classification

Apply the first matching rule:

1. An empty controller address is `unknown`.
2. A positive `delaySeconds` is a `timelock`. The delay shown is that recorded number of seconds.
3. A `threshold` greater than one is a `multisig`. The threshold and signer count are the recorded values.
4. Any other non-empty controller is a `single_key`.

A controller that also has a threshold and a delay is a timelock. The delay is the stronger custody fact.

## Grouping

Rows that share a controller address collapse into one group. The group lists every contract and role that address can change.
