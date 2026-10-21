import { describe, expect, it } from "vitest";
import { NetworkSettingsError } from "@/server/research/network-settings/errors";
import { NETWORK_SETTINGS_LIMITS } from "@/server/research/network-settings/limits";
import { assertSameNetwork, NETWORKS, parseNetworkId } from "@/server/research/network-settings/networkIdentity";
import { boundUpgradeHistory, defaultUpgradeRecords } from "@/server/research/network-settings/upgradeHistory";
import { historyRecords } from "./fixtures";

describe("upgrade history", () => {
  it("keeps ledger and protocol version and drops other networks", () => {
    const history = boundUpgradeHistory("testnet", historyRecords);

    expect(history.rejectedNetworks).toEqual(["futurenet", "mainnet"]);
    expect(history.upgrades.map((upgrade) => upgrade.ledger)).toEqual([1000, 2000, 3000]);
    expect(history.upgrades.map((upgrade) => upgrade.protocolVersion)).toEqual([21, 22, 23]);
    expect(history.upgrades.every((upgrade) => upgrade.network === "testnet")).toBe(true);
    expect(history.upgrades[0].upgradeType).toBe("ledgerUpgradeVersion");
    expect(history.upgrades[0].upgradeValue).toBe("21");
    expect(JSON.stringify(history)).not.toContain("999999");
  });

  it("bounds history to the newest ledgers", () => {
    const history = boundUpgradeHistory("testnet", historyRecords, 2);

    expect(history.truncated).toBe(true);
    expect(history.upgrades.map((upgrade) => upgrade.ledger)).toEqual([2000, 3000]);
    expect(NETWORK_SETTINGS_LIMITS.maxHistoryEntries).toBeGreaterThan(2);
  });

  it("refuses a history larger than the size bound", () => {
    const overflow = Array.from({ length: NETWORK_SETTINGS_LIMITS.maxUpgradeRecords + 1 }, (_, index) => ({
      ...historyRecords[0],
      ledger: index + 1,
    }));

    expect(() => boundUpgradeHistory("testnet", overflow)).toThrow(NetworkSettingsError);
  });

  it("rejects a record that has no protocol version", () => {
    expect(() => boundUpgradeHistory("testnet", [{ ...historyRecords[0], protocolVersion: 0 }])).toThrow(
      /protocol version/,
    );
  });

  it("keeps the default sample separated by network", () => {
    const testnet = boundUpgradeHistory("testnet", defaultUpgradeRecords());
    const mainnet = boundUpgradeHistory("mainnet", defaultUpgradeRecords());

    expect(testnet.upgrades.every((upgrade) => upgrade.network === "testnet")).toBe(true);
    expect(mainnet.upgrades.map((upgrade) => upgrade.ledger)).toEqual([60_000_000]);
    expect(testnet.upgrades.map((upgrade) => upgrade.ledger)).not.toContain(60_000_000);
    expect(() => parseNetworkId("pubnet")).toThrow(NetworkSettingsError);
    expect(() => parseNetworkId("stellar-testnet")).toThrow(NetworkSettingsError);
  });

  it("does not treat a passphrase from another network as valid", () => {
    expect(NETWORKS.testnet.passphrase).not.toBe(NETWORKS.mainnet.passphrase);
    expect(NETWORKS.futurenet.passphrase).not.toBe(NETWORKS.testnet.passphrase);
    expect(() => assertSameNetwork("testnet", "mainnet", "History")).toThrow(NetworkSettingsError);
  });
});
