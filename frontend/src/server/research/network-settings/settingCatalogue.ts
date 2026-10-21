/**
 * Names, units, and short meanings for Soroban ConfigSetting fields.
 * A field that is not listed still stays visible; it is not discarded.
 */

export type CatalogueRow = {
  name: string;
  unit: string;
  meaning: string;
};

export const SETTING_GROUPS: Record<number, CatalogueRow> = {
  0: {
    name: "Contract max size",
    unit: "bytes",
    meaning: "Largest contract WASM the network will accept.",
  },
  1: {
    name: "Contract compute",
    unit: "instructions",
    meaning: "Instruction and memory limits, plus the instruction fee rate.",
  },
  2: {
    name: "Contract ledger cost",
    unit: "entries",
    meaning: "Disk read and write limits and the rent fee curve.",
  },
  3: {
    name: "Historical data fee",
    unit: "stroops",
    meaning: "Fee for data pushed to history archives.",
  },
  4: {
    name: "Contract events",
    unit: "bytes",
    meaning: "Event size limit and the fee for emitting events.",
  },
  5: {
    name: "Bandwidth",
    unit: "bytes",
    meaning: "Transaction size limits and the per-KiB size fee.",
  },
  6: {
    name: "CPU cost parameters",
    unit: "instructions",
    meaning: "Per host-function CPU cost model. Each cost type has a constant and a linear term.",
  },
  7: {
    name: "Memory cost parameters",
    unit: "bytes",
    meaning: "Per host-function memory cost model. Each cost type has a constant and a linear term.",
  },
  8: {
    name: "Contract data key size",
    unit: "bytes",
    meaning: "Largest key stored in contract data.",
  },
  9: {
    name: "Contract data entry size",
    unit: "bytes",
    meaning: "Largest contract data entry.",
  },
  10: {
    name: "State archival",
    unit: "ledgers",
    meaning: "TTL bounds and how aggressively entries are archived.",
  },
  11: {
    name: "Execution lanes",
    unit: "transactions",
    meaning: "How many Soroban transactions one ledger may include.",
  },
  12: {
    name: "Live state window",
    unit: "bytes",
    meaning: "Recent samples of live Soroban state size.",
  },
  13: {
    name: "Eviction iterator",
    unit: "bytes",
    meaning: "Cursor the eviction scan has reached in the bucket list.",
  },
  14: {
    name: "Parallel compute",
    unit: "clusters",
    meaning: "How many dependent transaction clusters a parallel stage may hold.",
  },
  15: {
    name: "Ledger cost extension",
    unit: "entries",
    meaning: "Footprint entry cap and the flat write fee added after the rent curve.",
  },
  16: {
    name: "SCP timing",
    unit: "milliseconds",
    meaning: "Target close time and nomination and ballot timeouts.",
  },
  17: {
    name: "Frozen ledger keys",
    unit: "entries",
    meaning: "Ledger keys that cannot be written.",
  },
  18: {
    name: "Frozen ledger key delta",
    unit: "entries",
    meaning: "Keys to freeze or unfreeze in one config upgrade.",
  },
  19: {
    name: "Freeze bypass transactions",
    unit: "entries",
    meaning: "Transaction hashes allowed to write frozen keys.",
  },
  20: {
    name: "Freeze bypass delta",
    unit: "entries",
    meaning: "Hashes to add or remove from the freeze-bypass set.",
  },
};

const FIELD_CATALOGUE: Record<string, CatalogueRow> = {
  contractMaxSizeBytes: {
    name: "Maximum contract size",
    unit: "bytes",
    meaning: "Largest contract WASM the network will accept.",
  },
  "contractCompute.ledgerMaxInstructions": {
    name: "Maximum instructions per ledger",
    unit: "instructions",
    meaning: "Total WASM instructions every Soroban transaction in one ledger may consume.",
  },
  "contractCompute.txMaxInstructions": {
    name: "Maximum instructions per transaction",
    unit: "instructions",
    meaning: "WASM instructions one transaction may consume.",
  },
  "contractCompute.feeRatePerInstructionsIncrement": {
    name: "Fee per 10000 instructions",
    unit: "stroops",
    meaning: "Resource fee charged for each 10,000 instructions.",
  },
  "contractCompute.txMemoryLimit": {
    name: "Transaction memory limit",
    unit: "bytes",
    meaning: "Memory one transaction may allocate. There is no separate memory fee, only this cap.",
  },
  "contractLedgerCost.ledgerMaxDiskReadEntries": {
    name: "Maximum disk reads per ledger",
    unit: "entries",
    meaning: "Disk entry reads allowed across one ledger.",
  },
  "contractLedgerCost.ledgerMaxDiskReadBytes": {
    name: "Maximum disk read bytes per ledger",
    unit: "bytes",
    meaning: "Bytes that may be read from disk in one ledger.",
  },
  "contractLedgerCost.ledgerMaxWriteLedgerEntries": {
    name: "Maximum ledger writes per ledger",
    unit: "entries",
    meaning: "Ledger entry writes allowed across one ledger.",
  },
  "contractLedgerCost.ledgerMaxWriteBytes": {
    name: "Maximum bytes written per ledger",
    unit: "bytes",
    meaning: "Bytes that may be written in one ledger.",
  },
  "contractLedgerCost.txMaxDiskReadEntries": {
    name: "Maximum disk reads per transaction",
    unit: "entries",
    meaning: "Disk entry reads one transaction may perform.",
  },
  "contractLedgerCost.txMaxDiskReadBytes": {
    name: "Maximum disk read bytes per transaction",
    unit: "bytes",
    meaning: "Bytes one transaction may read from disk.",
  },
  "contractLedgerCost.txMaxWriteLedgerEntries": {
    name: "Maximum ledger writes per transaction",
    unit: "entries",
    meaning: "Ledger entry writes one transaction may perform.",
  },
  "contractLedgerCost.txMaxWriteBytes": {
    name: "Maximum bytes written per transaction",
    unit: "bytes",
    meaning: "Bytes one transaction may write.",
  },
  "contractLedgerCost.feeDiskReadLedgerEntry": {
    name: "Fee per disk entry read",
    unit: "stroops",
    meaning: "Fee charged for each disk ledger entry a transaction reads.",
  },
  "contractLedgerCost.feeWriteLedgerEntry": {
    name: "Fee per ledger entry write",
    unit: "stroops",
    meaning: "Fee charged for each ledger entry a transaction writes.",
  },
  "contractLedgerCost.feeDiskRead1Kb": {
    name: "Fee per KiB read from disk",
    unit: "stroops",
    meaning: "Fee for each KiB read from disk.",
  },
  "contractLedgerCost.sorobanStateTargetSizeBytes": {
    name: "Soroban state target size",
    unit: "bytes",
    meaning: "Live state size at which the rent fee reaches the high rate.",
  },
  "contractLedgerCost.rentFee1KbSorobanStateSizeLow": {
    name: "Low rent fee per KiB",
    unit: "stroops",
    meaning: "Rent fee per KiB when live Soroban state is empty. A negative value is a write subsidy.",
  },
  "contractLedgerCost.rentFee1KbSorobanStateSizeHigh": {
    name: "High rent fee per KiB",
    unit: "stroops",
    meaning: "Rent fee per KiB once live state reaches the target size.",
  },
  "contractLedgerCost.sorobanStateRentFeeGrowthFactor": {
    name: "Rent fee growth factor",
    unit: "multiplier",
    meaning: "Multiplier applied to rent once live state grows past the target size.",
  },
  "contractHistoricalData.feeHistorical1Kb": {
    name: "Archive storage fee per KiB",
    unit: "stroops",
    meaning: "Fee for storing one KiB in history archives.",
  },
  "contractEvents.txMaxContractEventsSizeBytes": {
    name: "Maximum contract event size",
    unit: "bytes",
    meaning: "Total event bytes one transaction may emit.",
  },
  "contractEvents.feeContractEvents1Kb": {
    name: "Contract event fee per KiB",
    unit: "stroops",
    meaning: "Fee for one KiB of contract events.",
  },
  "contractBandwidth.ledgerMaxTxsSizeBytes": {
    name: "Maximum total transaction size per ledger",
    unit: "bytes",
    meaning: "Sum of transaction envelope sizes allowed in one ledger.",
  },
  "contractBandwidth.txMaxSizeBytes": {
    name: "Maximum transaction size",
    unit: "bytes",
    meaning: "Largest transaction envelope the network will accept.",
  },
  "contractBandwidth.feeTxSize1Kb": {
    name: "Transaction size fee per KiB",
    unit: "stroops",
    meaning: "Fee for one KiB of transaction envelope.",
  },
  contractDataKeySizeBytes: {
    name: "Maximum contract data key size",
    unit: "bytes",
    meaning: "Largest key stored in contract data.",
  },
  contractDataEntrySizeBytes: {
    name: "Maximum contract data entry size",
    unit: "bytes",
    meaning: "Largest contract data entry.",
  },
  "stateArchivalSettings.maxEntryTtl": {
    name: "Maximum entry TTL",
    unit: "ledgers",
    meaning: "Furthest ledger an entry may live until.",
  },
  "stateArchivalSettings.minTemporaryTtl": {
    name: "Minimum temporary TTL",
    unit: "ledgers",
    meaning: "Shortest lifetime accepted for temporary entries.",
  },
  "stateArchivalSettings.minPersistentTtl": {
    name: "Minimum persistent TTL",
    unit: "ledgers",
    meaning: "Shortest lifetime accepted for persistent entries.",
  },
  "stateArchivalSettings.persistentRentRateDenominator": {
    name: "Persistent rent denominator",
    unit: "denominator",
    meaning: "Divisor in the persistent rent fee. Rent is the write fee divided by this value.",
  },
  "stateArchivalSettings.tempRentRateDenominator": {
    name: "Temporary rent denominator",
    unit: "denominator",
    meaning: "Divisor in the temporary rent fee.",
  },
  "stateArchivalSettings.maxEntriesToArchive": {
    name: "Maximum entries archived per ledger",
    unit: "entries",
    meaning: "How many entries may emit archival metadata in one ledger.",
  },
  "stateArchivalSettings.liveSorobanStateSizeWindowSampleSize": {
    name: "Live state window sample count",
    unit: "samples",
    meaning: "How many snapshots are averaged for live Soroban state size.",
  },
  "stateArchivalSettings.liveSorobanStateSizeWindowSamplePeriod": {
    name: "Live state window sample period",
    unit: "ledgers",
    meaning: "Ledgers between live state size samples.",
  },
  "stateArchivalSettings.evictionScanSize": {
    name: "Eviction scan size",
    unit: "bytes",
    meaning: "Bytes scanned for eviction in one ledger.",
  },
  "stateArchivalSettings.startingEvictionScanLevel": {
    name: "Starting eviction scan level",
    unit: "bucket level",
    meaning: "Lowest bucket-list level the eviction scan reads.",
  },
  "contractExecutionLanes.ledgerMaxTxCount": {
    name: "Maximum Soroban transactions per ledger",
    unit: "transactions",
    meaning: "Soroban transactions one ledger may include.",
  },
  "evictionIterator.bucketListLevel": {
    name: "Eviction bucket-list level",
    unit: "bucket level",
    meaning: "Bucket-list level the eviction cursor is on.",
  },
  "evictionIterator.isCurrBucket": {
    name: "Eviction cursor is on the current bucket",
    unit: "flag",
    meaning: "True when the cursor is in the current bucket rather than the next snapshot.",
  },
  "evictionIterator.bucketFileOffset": {
    name: "Eviction bucket file offset",
    unit: "bytes",
    meaning: "Byte offset of the eviction cursor inside the bucket file.",
  },
  "contractParallelCompute.ledgerMaxDependentTxClusters": {
    name: "Maximum dependent transaction clusters",
    unit: "clusters",
    meaning: "Dependent transaction clusters allowed in one parallel stage.",
  },
  "contractLedgerCostExt.txMaxFootprintEntries": {
    name: "Maximum footprint entries",
    unit: "entries",
    meaning: "Read-only plus read-write footprint entries one transaction may name.",
  },
  "contractLedgerCostExt.feeWrite1Kb": {
    name: "Ledger write fee per KiB",
    unit: "stroops",
    meaning: "Flat fee per KiB written, independent of the entry type.",
  },
  "contractScpTiming.ledgerTargetCloseTimeMilliseconds": {
    name: "Target ledger close time",
    unit: "milliseconds",
    meaning: "Ledger close time the network aims for.",
  },
  "contractScpTiming.nominationTimeoutInitialMilliseconds": {
    name: "Initial nomination timeout",
    unit: "milliseconds",
    meaning: "First nomination timeout.",
  },
  "contractScpTiming.nominationTimeoutIncrementMilliseconds": {
    name: "Nomination timeout increment",
    unit: "milliseconds",
    meaning: "Added to the nomination timeout after each round.",
  },
  "contractScpTiming.ballotTimeoutInitialMilliseconds": {
    name: "Initial ballot timeout",
    unit: "milliseconds",
    meaning: "First ballot timeout.",
  },
  "contractScpTiming.ballotTimeoutIncrementMilliseconds": {
    name: "Ballot timeout increment",
    unit: "milliseconds",
    meaning: "Added to the ballot timeout after each round.",
  },
  "frozenLedgerKeys.keys": {
    name: "Frozen ledger keys",
    unit: "entries",
    meaning: "How many ledger keys are frozen. An empty list is zero.",
  },
  "frozenLedgerKeysDelta.keysToFreeze": {
    name: "Keys to freeze",
    unit: "entries",
    meaning: "Keys a config upgrade will freeze.",
  },
  "frozenLedgerKeysDelta.keysToUnfreeze": {
    name: "Keys to unfreeze",
    unit: "entries",
    meaning: "Keys a config upgrade will unfreeze.",
  },
  "freezeBypassTxs.txHashes": {
    name: "Freeze-bypass transaction hashes",
    unit: "entries",
    meaning: "Transactions allowed to write frozen keys.",
  },
  "freezeBypassTxsDelta.addTxs": {
    name: "Freeze-bypass hashes to add",
    unit: "entries",
    meaning: "Hashes added to the freeze-bypass set.",
  },
  "freezeBypassTxsDelta.removeTxs": {
    name: "Freeze-bypass hashes to remove",
    unit: "entries",
    meaning: "Hashes removed from the freeze-bypass set.",
  },
};

const CPU_COST = /^contractCostParamsCpuInsns\.(.+)\.(constTerm|linearTerm)$/;
const MEMORY_COST = /^contractCostParamsMemBytes\.(.+)\.(constTerm|linearTerm)$/;
const STATE_SAMPLE = /^liveSorobanStateSizeWindow\.(\d+)$/;

export function catalogueField(key: string): CatalogueRow | null {
  return FIELD_CATALOGUE[key] ?? null;
}

export function describeSetting(key: string, settingId: number, known: boolean): CatalogueRow {
  if (!known) {
    return {
      name: `Config setting ${settingId}`,
      unit: "raw",
      meaning:
        "This setting id is not in the Soroban catalogue this build can decode. The value is the raw payload after the discriminant, hex encoded.",
    };
  }

  const exact = FIELD_CATALOGUE[key];

  if (exact) return exact;

  const cpu = CPU_COST.exec(key);

  if (cpu) {
    const term = cpu[2] === "constTerm" ? "constant term" : "linear term";

    return {
      name: `CPU cost ${cpu[1]} ${term}`,
      unit: cpu[2] === "constTerm" ? "instructions" : "instructions per input",
      meaning: "Coefficient in the host-function CPU cost model.",
    };
  }

  const memory = MEMORY_COST.exec(key);

  if (memory) {
    const term = memory[2] === "constTerm" ? "constant term" : "linear term";

    return {
      name: `Memory cost ${memory[1]} ${term}`,
      unit: memory[2] === "constTerm" ? "bytes" : "bytes per input",
      meaning: "Coefficient in the host-function memory cost model.",
    };
  }

  const sample = STATE_SAMPLE.exec(key);

  if (sample) {
    return {
      name: `Live Soroban state sample ${sample[1]}`,
      unit: "bytes",
      meaning: "One sample in the sliding window of live Soroban state size.",
    };
  }

  return {
    name: key,
    unit: "unspecified",
    meaning: "The decoded entry contains this field. The catalogue has no specific row for it yet.",
  };
}

export function listCatalogueFields(): string[] {
  return Object.keys(FIELD_CATALOGUE);
}
