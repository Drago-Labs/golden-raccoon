import { describe, expect, it } from "vitest";
import { decodeConfigSettings } from "@/server/research/network-settings/settingsDecoder";
import { diffSnapshots } from "@/server/research/network-settings/snapshotDiff";
import { compareNumeric } from "@/server/research/network-settings/units";
import { boundUpgradeHistory } from "@/server/research/network-settings/upgradeHistory";
import { historyRecords } from "./fixtures";

describe("snapshot diff", () => {
  it("lists only changed settings and distinguishes increases from decreases", () => {
    const history = boundUpgradeHistory("testnet", historyRecords);
    const before = history.upgrades[0];
    const after = history.upgrades[1];
    const changes = diffSnapshots(
      { network: "testnet", ledger: before.ledger, protocolVersion: before.protocolVersion, settings: before.settings },
      { network: "testnet", ledger: after.ledger, protocolVersion: after.protocolVersion, settings: after.settings },
    );

    expect(changes.map((change) => change.key)).toEqual([
      "contractCompute.feeRatePerInstructionsIncrement",
      "contractExecutionLanes.ledgerMaxTxCount",
    ]);
    expect(changes[0]).toMatchObject({ before: "25", after: "40", direction: "increase", unit: "stroops" });
    expect(changes[1]).toMatchObject({ before: "100", after: "80", direction: "decrease", unit: "transactions" });
    expect(compareNumeric("-17000", "-18000")).toBe("decrease");
    expect(changes.some((change) => change.key === "contractMaxSizeBytes")).toBe(false);
  });

  it("reports a setting that exists on only one side as changed", () => {
    const [onlyBefore] = decodeConfigSettings([historyRecords[0].entries[0].xdr]);
    const changes = diffSnapshots(
      { network: "futurenet", ledger: 1, protocolVersion: 1, settings: [onlyBefore] },
      { network: "futurenet", ledger: 2, protocolVersion: 1, settings: [] },
    );

    expect(changes).toEqual([
      {
        key: onlyBefore.key,
        name: onlyBefore.name,
        unit: onlyBefore.unit,
        before: onlyBefore.value,
        after: null,
        direction: "changed",
      },
    ]);
  });

  it("refuses to diff two networks", () => {
    const snapshot = { network: "testnet" as const, ledger: 1, protocolVersion: 1, settings: [] };

    expect(() => diffSnapshots(snapshot, { ...snapshot, network: "mainnet" })).toThrow(/cannot mix testnet with mainnet/);
  });
});
