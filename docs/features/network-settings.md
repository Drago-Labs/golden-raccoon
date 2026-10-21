# Soroban network settings

Read-only view of the Soroban `ConfigSettingEntry` values a network is enforcing, and of how those values moved between recorded upgrades.

The page at `/insights/network-settings` asks for one of testnet, futurenet, or mainnet. It never mixes them. A setting that this build cannot name is still shown, with the raw payload, because dropping an unknown id would hide a limit change.

## What a row means

Each row is one field inside a `ConfigSettingEntry`. The value is the integer (or flag) from the XDR. The unit is the one the field is counted in. Fee fields are stroops, which are 1/10,000,000 of a lumen. A negative rent fee is a write subsidy, not a missing value.

### Contract size and data

| Setting | Unit | Meaning |
| --- | --- | --- |
| Maximum contract size | bytes | Largest contract WASM the network will accept. |
| Maximum contract data key size | bytes | Largest key stored in contract data. |
| Maximum contract data entry size | bytes | Largest contract data entry. |

### Compute

| Setting | Unit | Meaning |
| --- | --- | --- |
| Maximum instructions per ledger | instructions | Total WASM instructions every Soroban transaction in one ledger may consume. |
| Maximum instructions per transaction | instructions | WASM instructions one transaction may consume. |
| Fee per 10000 instructions | stroops | Resource fee charged for each 10,000 instructions. |
| Transaction memory limit | bytes | Memory one transaction may allocate. There is no separate memory fee, only this cap. |

### Ledger cost

| Setting | Unit | Meaning |
| --- | --- | --- |
| Maximum disk reads per ledger | entries | Disk entry reads allowed across one ledger. |
| Maximum disk read bytes per ledger | bytes | Bytes that may be read from disk in one ledger. |
| Maximum ledger writes per ledger | entries | Ledger entry writes allowed across one ledger. |
| Maximum bytes written per ledger | bytes | Bytes that may be written in one ledger. |
| Maximum disk reads per transaction | entries | Disk entry reads one transaction may perform. |
| Maximum disk read bytes per transaction | bytes | Bytes one transaction may read from disk. |
| Maximum ledger writes per transaction | entries | Ledger entry writes one transaction may perform. |
| Maximum bytes written per transaction | bytes | Bytes one transaction may write. |
| Fee per disk entry read | stroops | Fee charged for each disk ledger entry a transaction reads. |
| Fee per ledger entry write | stroops | Fee charged for each ledger entry a transaction writes. |
| Fee per KiB read from disk | stroops | Fee for each KiB read from disk. |
| Soroban state target size | bytes | Live state size at which the rent fee reaches the high rate. |
| Low rent fee per KiB | stroops | Rent fee per KiB when live Soroban state is empty. A negative value is a write subsidy. |
| High rent fee per KiB | stroops | Rent fee per KiB once live state reaches the target size. |
| Rent fee growth factor | multiplier | Multiplier applied to rent once live state grows past the target size. |
| Maximum footprint entries | entries | Read-only plus read-write footprint entries one transaction may name. |
| Ledger write fee per KiB | stroops | Flat fee per KiB written, independent of the entry type. |

### Events, bandwidth, and archives

| Setting | Unit | Meaning |
| --- | --- | --- |
| Archive storage fee per KiB | stroops | Fee for storing one KiB in history archives. |
| Maximum contract event size | bytes | Total event bytes one transaction may emit. |
| Contract event fee per KiB | stroops | Fee for one KiB of contract events. |
| Maximum total transaction size per ledger | bytes | Sum of transaction envelope sizes allowed in one ledger. |
| Maximum transaction size | bytes | Largest transaction envelope the network will accept. |
| Transaction size fee per KiB | stroops | Fee for one KiB of transaction envelope. |

### State archival and eviction

| Setting | Unit | Meaning |
| --- | --- | --- |
| Maximum entry TTL | ledgers | Furthest ledger an entry may live until. |
| Minimum temporary TTL | ledgers | Shortest lifetime accepted for temporary entries. |
| Minimum persistent TTL | ledgers | Shortest lifetime accepted for persistent entries. |
| Persistent rent denominator | denominator | Divisor in the persistent rent fee. Rent is the write fee divided by this value. |
| Temporary rent denominator | denominator | Divisor in the temporary rent fee. |
| Maximum entries archived per ledger | entries | How many entries may emit archival metadata in one ledger. |
| Live state window sample count | samples | How many snapshots are averaged for live Soroban state size. |
| Live state window sample period | ledgers | Ledgers between live state size samples. |
| Eviction scan size | bytes | Bytes scanned for eviction in one ledger. |
| Starting eviction scan level | bucket level | Lowest bucket-list level the eviction scan reads. |
| Eviction bucket-list level | bucket level | Bucket-list level the eviction cursor is on. |
| Eviction cursor is on the current bucket | flag | True when the cursor is in the current bucket rather than the next snapshot. |
| Eviction bucket file offset | bytes | Byte offset of the eviction cursor inside the bucket file. |
| Live Soroban state sample *n* | bytes | One sample in the sliding window of live Soroban state size. |

### Inclusion limits and SCP timing

| Setting | Unit | Meaning |
| --- | --- | --- |
| Maximum Soroban transactions per ledger | transactions | Soroban transactions one ledger may include. |
| Maximum dependent transaction clusters | clusters | Dependent transaction clusters allowed in one parallel stage. |
| Target ledger close time | milliseconds | Ledger close time the network aims for. |
| Initial nomination timeout | milliseconds | First nomination timeout. |
| Nomination timeout increment | milliseconds | Added to the nomination timeout after each round. |
| Initial ballot timeout | milliseconds | First ballot timeout. |
| Ballot timeout increment | milliseconds | Added to the ballot timeout after each round. |

### Host-function cost models

CPU cost parameters and memory cost parameters are arrays indexed by `ContractCostType`. Each cost type has two settings:

| Setting | Unit | Meaning |
| --- | --- | --- |
| CPU cost *name* constant term | instructions | Fixed instruction cost of that host function. |
| CPU cost *name* linear term | instructions per input | Extra instructions charged per unit of input. |
| Memory cost *name* constant term | bytes | Fixed memory cost of that host function. |
| Memory cost *name* linear term | bytes per input | Extra bytes charged per unit of input. |

An index this build does not name is kept as `costType.<id>` with the same units. A void extension on a cost entry is omitted. A non-void extension is shown so it is not dropped.

### Freeze lists

| Setting | Unit | Meaning |
| --- | --- | --- |
| Frozen ledger keys | entries | How many ledger keys are frozen. An empty list is zero. |
| Keys to freeze | entries | Keys a config upgrade will freeze. |
| Keys to unfreeze | entries | Keys a config upgrade will unfreeze. |
| Freeze-bypass transaction hashes | entries | Transactions allowed to write frozen keys. |
| Freeze-bypass hashes to add | entries | Hashes added to the freeze-bypass set. |
| Freeze-bypass hashes to remove | entries | Hashes removed from the freeze-bypass set. |

### Unknown ids

| Setting | Unit | Meaning |
| --- | --- | --- |
| Config setting *id* | raw | The id is not in the Soroban catalogue this build can decode. The value is the payload after the discriminant, hex encoded. |

## Upgrades and diffs

Recorded upgrades carry a ledger sequence and a protocol version. The history shown for a network never includes another network's records, and it keeps at most the newest 24. A diff of two snapshots lists every field whose value changed and no field whose value did not. A larger integer is an increase, including a move from a more negative rent fee toward zero. A smaller integer is a decrease. A flag or a value that exists on only one side is marked changed.

## What this page does not do

It does not vote on upgrades, recommend a fee, or change the risk score.
