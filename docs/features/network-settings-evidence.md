# Network settings evidence

## Sources

Current settings come from Soroban RPC `getLedgerEntries`. Each key is a `LedgerKey` of type `CONFIG_SETTING` for one `ConfigSettingID` known to `@stellar/stellar-sdk` 17.0.1, which is already a frontend dependency. The `xdr` field on each result is `LedgerEntryData`. `lastModifiedLedgerSeq` is a sibling field, not part of that XDR. Protocol version and the network passphrase come from `getLatestLedger` and `getNetwork`.

The reader checks the passphrase before it returns rows. Testnet, futurenet, and mainnet use different passphrases and different RPC hosts:

| Network | Passphrase | RPC |
| --- | --- | --- |
| testnet | Test SDF Network ; September 2015 | https://soroban-testnet.stellar.org |
| futurenet | Test SDF Future Network ; October 2022 | https://rpc-futurenet.stellar.org |
| mainnet | Public Global Stellar Network ; September 2015 | https://mainnet.sorobanrpc.com |

No alias is accepted. `pubnet` and `stellar-testnet` are rejected so this feature cannot collapse onto another module's network id.

## What was read from testnet

On 21 October 2026, `getNetwork` on testnet reported protocol 29. `getLedgerEntries` for the known config keys returned these scalar values (ledger close around 5,312,825). They are the figures encoded in `frontend/tests/features/network-settings/data/testnet-settings.json` for the entries that were copied from that response. The fixture tests do not call the network; they decode those bytes.

| Setting | Value | Unit |
| --- | --- | --- |
| Maximum contract size | 131072 | bytes |
| Maximum instructions per ledger | 580000000 | instructions |
| Maximum instructions per transaction | 400000000 | instructions |
| Fee per 10000 instructions | 3 | stroops |
| Transaction memory limit | 41943040 | bytes |
| Archive storage fee per KiB | 2029 | stroops |
| Maximum contract event size | 16384 | bytes |
| Contract event fee per KiB | 2500 | stroops |
| Maximum total transaction size per ledger | 864000 | bytes |
| Maximum transaction size | 132096 | bytes |
| Transaction size fee per KiB | 203 | stroops |
| Maximum contract data key size | 250 | bytes |
| Maximum contract data entry size | 65536 | bytes |
| Maximum entry TTL | 3110400 | ledgers |
| Minimum temporary TTL | 720 | ledgers |
| Minimum persistent TTL | 120960 | ledgers |
| Persistent rent denominator | 1215 | denominator |
| Temporary rent denominator | 2430 | denominator |
| Maximum entries archived per ledger | 1000 | entries |
| Live state window sample count | 30 | samples |
| Live state window sample period | 64 | ledgers |
| Eviction scan size | 500000 | bytes |
| Starting eviction scan level | 7 | bucket level |
| Maximum Soroban transactions per ledger | 2000 | transactions |
| Maximum dependent transaction clusters | 3 | clusters |
| Maximum footprint entries | 400 | entries |
| Ledger write fee per KiB | 437 | stroops |
| Target ledger close time | 5000 | milliseconds |
| Nomination and ballot timeouts | 1000 | milliseconds |

Stellar's resource-limits documentation (https://developers.stellar.org/docs/networks/resource-limits-fees) describes the same fields: instruction caps, inclusion limits, and fees in stroops. The table above is the testnet response at that ledger, not a copy of the documentation page. A later upgrade can move any of them. That is why the page reads the chain instead of hard-coding the table.

Two synthetic entries are in the same fixture so the decoder tests stay exact without shipping the full CPU and memory cost arrays: one `WasmInsnExec` cost row (constant term 71 instructions, linear term 13 instructions per input) and one ledger-cost entry whose low rent fee is -17000 stroops. Those numbers were chosen so an increase, a decrease, and a negative fee are obvious. They are not claimed as the live cost model.

## History

The upgrade timeline is recorded ledger-upgrade data: a ledger sequence, a protocol version, an optional `LedgerUpgrade` XDR, and the `ConfigSettingEntry` values that were in force after that upgrade. The loader drops records whose network does not match the request and keeps at most 24 of the newest remaining ledgers. It does not scrape the full validator history, and it does not invent a value for a setting the record did not include.

The sample shipped in the server module uses ledgers 1000000 and 2000000 on testnet, ledger 900 on futurenet, and ledger 60000000 on mainnet. Those sequences label the recording. They are not a claim that a config upgrade was applied at that exact ledger. The fixture file adds a mainnet and a futurenet record beside testnet records so the tests can prove the extra records stay out of a testnet result.

## Limits

| Bound | Value |
| --- | --- |
| History kept | 24 newest upgrades |
| History records accepted | 200 |
| Setting rows kept | 4000 |
| Request body | 32768 characters |
| One setting XDR | 256000 characters |
| RPC timeout | 8000 ms |
| Page size | 50, capped at 100 |

A missing setting id is a coverage gap, not a zero. An RPC timeout or a passphrase mismatch yields `unavailable` and does not fill the table from another network. Unknown setting ids are hex, unit `raw`.

## Out of scope

Voting on upgrades, fee recommendations, and the risk score are unchanged.
