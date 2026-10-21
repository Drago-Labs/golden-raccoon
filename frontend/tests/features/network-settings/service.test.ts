import { describe, expect, it } from "vitest";
import { buildCoverage } from "@/server/research/network-settings/coverage";
import { NetworkSettingsError } from "@/server/research/network-settings/errors";
import { inspectNetworkSettings } from "@/server/research/network-settings";
import { pageWindow } from "@/server/research/network-settings/limits";
import {
  configSettingKeyXdrs,
  readCurrentSettings,
  type RpcSettingsReader,
} from "@/server/research/network-settings/settingsReader";
import { providerUnavailable, fixtureTransport, historyRecords, testnetSettings } from "./fixtures";

function reader(network: "testnet" | "futurenet" | "mainnet", options: { fail?: boolean } = {}): RpcSettingsReader {
  const transport = fixtureTransport(network, options);

  return {
    async read(requested) {
      return readCurrentSettings(requested, transport, 1_000);
    },
  };
}

describe("network settings service", () => {
  it("reads the injected fixture and keeps other networks out of the history", async () => {
    const report = await inspectNetworkSettings(
      { network: "testnet", compare: { beforeLedger: 1000, afterLedger: 2000 } },
      { reader: reader("testnet"), history: historyRecords },
    );

    expect(report.network).toBe("testnet");
    expect(report.ledger).toBe(testnetSettings.ledger);
    expect(report.protocolVersion).toBe(29);
    expect(report.settings.some((setting) => setting.value === "131072" && setting.unit === "bytes")).toBe(true);
    expect(report.settings.some((setting) => setting.known === false)).toBe(false);
    expect(report.history.map((upgrade) => upgrade.ledger)).toEqual([1000, 2000, 3000]);
    expect(report.diff?.map((change) => change.direction).sort()).toEqual(["decrease", "increase"]);
    expect(report.warnings.some((warning) => warning.includes("mainnet"))).toBe(true);
    expect(report.coverage.returned).toBeGreaterThan(0);
  });

  it("returns an unavailable report when the provider fails", async () => {
    const report = await inspectNetworkSettings(
      { network: "testnet" },
      { reader: reader("testnet", { fail: true }), history: historyRecords },
    );

    expect(report.state).toBe("unavailable");
    expect(report.settings).toEqual([]);
    expect(report.coverage.message).toMatch(/Nothing here is inferred/);
    expect(report.warnings.join(" ")).toContain(providerUnavailable.message);
  });

  it("does not borrow testnet values when mainnet is requested", async () => {
    const report = await inspectNetworkSettings({ network: "mainnet" }, { reader: reader("mainnet"), history: historyRecords });

    expect(report.network).toBe("mainnet");
    expect(report.ledger).toBe(60_000_000);
    expect(report.settings.map((setting) => setting.value)).toEqual(["65536"]);
    expect(report.history.map((upgrade) => upgrade.ledger)).toEqual([999999]);
  });

  it("times out a reader that never answers", async () => {
    await expect(readCurrentSettings("testnet", { getEntries: () => new Promise(() => undefined) }, 20)).rejects.toMatchObject({
      code: "provider_unavailable",
    });
  });

  it("rejects a provider passphrase from another network", async () => {
    await expect(readCurrentSettings("testnet", {
      async getEntries() {
        return { ledger: 1, protocolVersion: 23, passphrase: "Public Global Stellar Network ; September 2015", entries: [] };
      },
    }, 1_000)).rejects.toBeInstanceOf(NetworkSettingsError);
  });

  it("builds one ledger key per known setting id", () => {
    const keys = configSettingKeyXdrs();

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(21);
  });

  it("pages settings and marks a complete read when every id comes back", () => {
    expect(pageWindow(10, 2, 4)).toEqual({ page: 2, pageSize: 4, start: 4, end: 8 });

    const coverage = buildCoverage({
      requested: 3,
      returned: 3,
      unknown: 0,
      historyKept: 2,
      historyTruncated: false,
      providerFailed: false,
    });

    expect(coverage.state).toBe("complete");
  });
});
