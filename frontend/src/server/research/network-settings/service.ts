/**
 * Assemble the current settings, the bounded upgrade history, and an optional diff.
 * The RPC reader is injected so tests never open a socket.
 */

import { buildCoverage } from "./coverage";
import { NetworkSettingsError, type SettingsReadState } from "./errors";
import { NETWORK_SETTINGS_LIMITS, pageWindow } from "./limits";
import { parseNetworkId, type NetworkId } from "./networkIdentity";
import { networkSettingsRequestSchema, type NetworkSettingsReport, type SettingSnapshot } from "./schema";
import { decodeConfigSettings } from "./settingsDecoder";
import { configSettingKeyXdrs, createRpcSettingsReader, type RpcSettingsReader } from "./settingsReader";
import { diffSnapshots } from "./snapshotDiff";
import { boundUpgradeHistory, defaultUpgradeRecords, type UpgradeRecord } from "./upgradeHistory";

export type NetworkSettingsDependencies = {
  reader?: RpcSettingsReader;
  history?: readonly UpgradeRecord[];
};

function unavailableReport(
  network: NetworkId,
  message: string,
  history: ReturnType<typeof boundUpgradeHistory>,
  warnings: string[],
): NetworkSettingsReport {
  return {
    state: "unavailable",
    network,
    ledger: null,
    protocolVersion: null,
    settings: [],
    settingCount: 0,
    page: 1,
    history: history.upgrades,
    diff: null,
    coverage: buildCoverage({
      requested: configSettingKeyXdrs().length,
      returned: 0,
      unknown: 0,
      historyKept: history.upgrades.length,
      historyTruncated: history.truncated,
      providerFailed: true,
    }),
    warnings: [...warnings, message],
  };
}

export async function inspectNetworkSettings(
  input: unknown,
  dependencies: NetworkSettingsDependencies = {},
): Promise<NetworkSettingsReport> {
  const parsed = networkSettingsRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new NetworkSettingsError("invalid_request", "Network settings request is invalid.", parsed.error.flatten());
  }

  const network = parseNetworkId(parsed.data.network);
  const history = boundUpgradeHistory(network, dependencies.history ?? defaultUpgradeRecords());
  const warnings: string[] = [];

  if (history.rejectedNetworks.length > 0) {
    warnings.push(`Ignored upgrades from ${history.rejectedNetworks.join(", ")}.`);
  }

  if (history.truncated) {
    warnings.push("Upgrade history was truncated to the newest recorded ledgers.");
  }

  const reader = dependencies.reader ?? createRpcSettingsReader(network);
  let current;

  try {
    current = await reader.read(network, { timeoutMs: NETWORK_SETTINGS_LIMITS.rpcTimeoutMs });
  } catch (error) {
    if (error instanceof NetworkSettingsError && (error.code === "provider_unavailable" || error.code === "network_mismatch")) {
      return unavailableReport(network, error.message, history, warnings);
    }

    throw error;
  }

  if (current.network !== network) {
    throw new NetworkSettingsError("network_mismatch", "The reader returned a different network.");
  }

  const decoded = decodeConfigSettings(current.entries.map((entry) => entry.xdr)).slice(0, NETWORK_SETTINGS_LIMITS.maxSettings);
  const unknown = new Set(decoded.filter((setting) => !setting.known).map((setting) => setting.settingId)).size;
  const returnedIds = new Set(decoded.map((setting) => setting.settingId));
  const window = pageWindow(decoded.length, parsed.data.page ?? 1);
  let coverage = buildCoverage({
    requested: configSettingKeyXdrs().length,
    returned: returnedIds.size,
    unknown,
    historyKept: history.upgrades.length,
    historyTruncated: history.truncated,
    providerFailed: false,
  });

  if (window.start >= decoded.length && decoded.length > 0) {
    warnings.push("That page is past the end of the settings table.");
  }

  let diff: NetworkSettingsReport["diff"] = null;

  if (parsed.data.compare) {
    const before = history.upgrades.find((upgrade) => upgrade.ledger === parsed.data.compare?.beforeLedger);
    const after = history.upgrades.find((upgrade) => upgrade.ledger === parsed.data.compare?.afterLedger);

    if (!before || !after) {
      warnings.push("One of the ledgers is not in the recorded history for this network.");
      coverage = {
        ...coverage,
        state: "partial",
        message: `${coverage.message} A requested snapshot is missing.`,
      };
    } else {
      const beforeSnapshot: SettingSnapshot = {
        network,
        ledger: before.ledger,
        protocolVersion: before.protocolVersion,
        settings: before.settings,
      };
      const afterSnapshot: SettingSnapshot = {
        network,
        ledger: after.ledger,
        protocolVersion: after.protocolVersion,
        settings: after.settings,
      };

      diff = diffSnapshots(beforeSnapshot, afterSnapshot);
    }
  }

  const state: SettingsReadState = coverage.state;

  return {
    state,
    network,
    ledger: current.ledger,
    protocolVersion: current.protocolVersion,
    settings: decoded.slice(window.start, window.end),
    settingCount: decoded.length,
    page: window.page,
    history: history.upgrades,
    diff,
    coverage,
    warnings,
  };
}

export function createDefaultSettingsReader(network: NetworkId): RpcSettingsReader {
  return createRpcSettingsReader(network);
}
