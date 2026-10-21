import testnetSettings from "./data/testnet-settings.json";
import upgradeHistory from "./data/upgrade-history.json";
import unknownSetting from "./data/unknown-setting.json";
import providerUnavailable from "./data/provider-unavailable.json";
import type { UpgradeRecord } from "@/server/research/network-settings/upgradeHistory";
import type { ConfigEntryTransport } from "@/server/research/network-settings/settingsReader";
import { NETWORKS, type NetworkId } from "@/server/research/network-settings/networkIdentity";
import { NetworkSettingsError } from "@/server/research/network-settings/errors";

export { testnetSettings, upgradeHistory, unknownSetting, providerUnavailable };

export const historyRecords = upgradeHistory.records as UpgradeRecord[];

export function entryXdr(id: string): string {
  const entry = testnetSettings.entries.find((item) => item.id === id);

  if (!entry) throw new Error(`Missing fixture entry ${id}.`);

  return entry.xdr;
}

/** Injected RPC transport. It answers from the fixture for the requested network only. */
export function fixtureTransport(network: NetworkId, options: { fail?: boolean } = {}): ConfigEntryTransport {
  return {
    async getEntries(input) {
      if (input.network !== network) {
        throw new Error(`Transport for ${network} was asked for ${input.network}.`);
      }

      if (options.fail) {
        throw new NetworkSettingsError("provider_unavailable", providerUnavailable.message);
      }

      if (network !== "testnet") {
        return {
          ledger: network === "mainnet" ? 60_000_000 : 900,
          protocolVersion: network === "mainnet" ? 23 : 24,
          passphrase: NETWORKS[network].passphrase,
          entries: [{ xdr: network === "mainnet" ? entryXdr("entry-size") : entryXdr("parallel") }],
        };
      }

      return {
        ledger: testnetSettings.ledger,
        protocolVersion: testnetSettings.protocolVersion,
        passphrase: testnetSettings.passphrase,
        entries: testnetSettings.entries.map((entry) => ({ xdr: entry.xdr })),
      };
    },
  };
}
