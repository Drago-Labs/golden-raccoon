import { describe, expect, it } from "vitest";
import { decodeConfigSettingXdr } from "@/server/research/network-settings/settingsDecoder";
import { formatSettingValue } from "@/server/research/network-settings/units";
import { entryXdr, testnetSettings, unknownSetting } from "./fixtures";

/**
 * Expected rows are the figures encoded in the fixture XDR.
 * Live testnet entries were recorded from getLedgerEntries; the cost rows
 * were encoded with the SDK from the numbers asserted here.
 */
const EXPECTED: Record<string, Record<string, { value: string; unit: string }>> = {
  "max-size": {
    contractMaxSizeBytes: { value: "131072", unit: "bytes" },
  },
  compute: {
    "contractCompute.feeRatePerInstructionsIncrement": { value: "3", unit: "stroops" },
    "contractCompute.ledgerMaxInstructions": { value: "580000000", unit: "instructions" },
    "contractCompute.txMaxInstructions": { value: "400000000", unit: "instructions" },
    "contractCompute.txMemoryLimit": { value: "41943040", unit: "bytes" },
  },
  historical: {
    "contractHistoricalData.feeHistorical1Kb": { value: "2029", unit: "stroops" },
  },
  events: {
    "contractEvents.feeContractEvents1Kb": { value: "2500", unit: "stroops" },
    "contractEvents.txMaxContractEventsSizeBytes": { value: "16384", unit: "bytes" },
  },
  bandwidth: {
    "contractBandwidth.feeTxSize1Kb": { value: "203", unit: "stroops" },
    "contractBandwidth.ledgerMaxTxsSizeBytes": { value: "864000", unit: "bytes" },
    "contractBandwidth.txMaxSizeBytes": { value: "132096", unit: "bytes" },
  },
  "key-size": {
    contractDataKeySizeBytes: { value: "250", unit: "bytes" },
  },
  "entry-size": {
    contractDataEntrySizeBytes: { value: "65536", unit: "bytes" },
  },
  archival: {
    "stateArchivalSettings.evictionScanSize": { value: "500000", unit: "bytes" },
    "stateArchivalSettings.liveSorobanStateSizeWindowSamplePeriod": { value: "64", unit: "ledgers" },
    "stateArchivalSettings.liveSorobanStateSizeWindowSampleSize": { value: "30", unit: "samples" },
    "stateArchivalSettings.maxEntriesToArchive": { value: "1000", unit: "entries" },
    "stateArchivalSettings.maxEntryTtl": { value: "3110400", unit: "ledgers" },
    "stateArchivalSettings.minPersistentTtl": { value: "120960", unit: "ledgers" },
    "stateArchivalSettings.minTemporaryTtl": { value: "720", unit: "ledgers" },
    "stateArchivalSettings.persistentRentRateDenominator": { value: "1215", unit: "denominator" },
    "stateArchivalSettings.startingEvictionScanLevel": { value: "7", unit: "bucket level" },
    "stateArchivalSettings.tempRentRateDenominator": { value: "2430", unit: "denominator" },
  },
  lanes: {
    "contractExecutionLanes.ledgerMaxTxCount": { value: "2000", unit: "transactions" },
  },
  parallel: {
    "contractParallelCompute.ledgerMaxDependentTxClusters": { value: "3", unit: "clusters" },
  },
  "ledger-cost-ext": {
    "contractLedgerCostExt.feeWrite1Kb": { value: "437", unit: "stroops" },
    "contractLedgerCostExt.txMaxFootprintEntries": { value: "400", unit: "entries" },
  },
  scp: {
    "contractScpTiming.ballotTimeoutIncrementMilliseconds": { value: "1000", unit: "milliseconds" },
    "contractScpTiming.ballotTimeoutInitialMilliseconds": { value: "1000", unit: "milliseconds" },
    "contractScpTiming.ledgerTargetCloseTimeMilliseconds": { value: "5000", unit: "milliseconds" },
    "contractScpTiming.nominationTimeoutIncrementMilliseconds": { value: "1000", unit: "milliseconds" },
    "contractScpTiming.nominationTimeoutInitialMilliseconds": { value: "1000", unit: "milliseconds" },
  },
  "cpu-cost": {
    "contractCostParamsCpuInsns.wasmInsnExec.constTerm": { value: "71", unit: "instructions" },
    "contractCostParamsCpuInsns.wasmInsnExec.linearTerm": { value: "13", unit: "instructions per input" },
  },
  "ledger-cost": {
    "contractLedgerCost.feeDiskRead1Kb": { value: "223", unit: "stroops" },
    "contractLedgerCost.feeDiskReadLedgerEntry": { value: "781", unit: "stroops" },
    "contractLedgerCost.feeWriteLedgerEntry": { value: "1250", unit: "stroops" },
    "contractLedgerCost.ledgerMaxDiskReadBytes": { value: "400000", unit: "bytes" },
    "contractLedgerCost.ledgerMaxDiskReadEntries": { value: "2000", unit: "entries" },
    "contractLedgerCost.ledgerMaxWriteBytes": { value: "297000", unit: "bytes" },
    "contractLedgerCost.ledgerMaxWriteLedgerEntries": { value: "2000", unit: "entries" },
    "contractLedgerCost.rentFee1KbSorobanStateSizeHigh": { value: "10000", unit: "stroops" },
    "contractLedgerCost.rentFee1KbSorobanStateSizeLow": { value: "-17000", unit: "stroops" },
    "contractLedgerCost.sorobanStateRentFeeGrowthFactor": { value: "50", unit: "multiplier" },
    "contractLedgerCost.sorobanStateTargetSizeBytes": { value: "4000000000", unit: "bytes" },
    "contractLedgerCost.txMaxDiskReadBytes": { value: "200000", unit: "bytes" },
    "contractLedgerCost.txMaxDiskReadEntries": { value: "200", unit: "entries" },
    "contractLedgerCost.txMaxWriteBytes": { value: "132096", unit: "bytes" },
    "contractLedgerCost.txMaxWriteLedgerEntries": { value: "200", unit: "entries" },
  },
};

describe("settings decoder", () => {
  it("matches every recorded fixture value and unit", () => {
    expect(formatSettingValue(131072n)).toBe("131072");

    for (const entry of testnetSettings.entries) {
      const decoded = decodeConfigSettingXdr(entry.xdr);
      const expected = EXPECTED[entry.id];

      expect(decoded.map((row) => row.key)).toEqual(Object.keys(expected));

      for (const row of decoded) {
        expect(row.value).toBe(expected[row.key].value);
        expect(row.unit).toBe(expected[row.key].unit);
        expect(row.known).toBe(true);
        expect(row.name.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps an unknown setting id and shows the payload raw", () => {
    for (const xdrValue of [unknownSetting.xdr, unknownSetting.wrappedXdr]) {
      const decoded = decodeConfigSettingXdr(xdrValue);

      expect(decoded).toEqual([
        {
          key: "configSetting.250",
          settingId: 250,
          name: "Config setting 250",
          value: "00000007",
          unit: "raw",
          known: false,
        },
      ]);
    }
  });

  it("reads the recorded testnet maximum contract size from the fixture file", () => {
    const decoded = decodeConfigSettingXdr(entryXdr("max-size"));

    expect(decoded[0]).toMatchObject({ value: "131072", unit: "bytes", settingId: 0 });
    expect(testnetSettings.ledger).toBeGreaterThan(0);
  });
});
