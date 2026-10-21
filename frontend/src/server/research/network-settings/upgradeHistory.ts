/**
 * Bounded history of recorded config upgrades.
 * Records for other networks are left out, not merged.
 */

import { xdr } from "@stellar/stellar-sdk";
import { decodeConfigSettings } from "./settingsDecoder";
import { NetworkSettingsError } from "./errors";
import { NETWORK_SETTINGS_LIMITS } from "./limits";
import { isNetworkId, type NetworkId } from "./networkIdentity";
import type { DecodedSetting, UpgradeView } from "./schema";

export type UpgradeRecord = {
  network: NetworkId;
  ledger: number;
  protocolVersion: number;
  upgradeXdr?: string;
  entries: Array<{ xdr: string }>;
};

export type BoundedHistory = {
  upgrades: UpgradeView[];
  truncated: boolean;
  rejectedNetworks: NetworkId[];
};

function describeUpgrade(upgradeXdr: string | undefined): { upgradeType: string | null; upgradeValue: string | null } {
  if (!upgradeXdr) return { upgradeType: null, upgradeValue: null };

  if (!xdr.LedgerUpgrade.validateXdr(upgradeXdr, "base64")) {
    throw new NetworkSettingsError("invalid_history", "Recorded ledger upgrade XDR could not be decoded.");
  }

  const upgrade = xdr.LedgerUpgrade.fromXdr(upgradeXdr, "base64");
  const value = upgrade.value;
  const upgradeValue = typeof value === "number" || typeof value === "bigint"
    ? String(value)
    : value && typeof value === "object" && "toXdr" in value && typeof value.toXdr === "function"
      ? value.toXdr("base64")
      : String(value);

  return { upgradeType: upgrade.type, upgradeValue };
}

function toView(record: UpgradeRecord): UpgradeView {
  const upgrade = describeUpgrade(record.upgradeXdr);
  let settings: DecodedSetting[];

  try {
    settings = decodeConfigSettings(record.entries.map((entry) => entry.xdr));
  } catch (error) {
    if (error instanceof NetworkSettingsError && error.code === "not_config_setting") throw error;

    throw new NetworkSettingsError(
      "invalid_history",
      error instanceof Error ? error.message : "Recorded upgrade settings could not be decoded.",
    );
  }

  return {
    network: record.network,
    ledger: record.ledger,
    protocolVersion: record.protocolVersion,
    upgradeType: upgrade.upgradeType,
    upgradeValue: upgrade.upgradeValue,
    settings,
  };
}

export function boundUpgradeHistory(
  network: NetworkId,
  records: readonly UpgradeRecord[],
  limit = NETWORK_SETTINGS_LIMITS.maxHistoryEntries,
): BoundedHistory {
  if (records.length > NETWORK_SETTINGS_LIMITS.maxUpgradeRecords) {
    throw new NetworkSettingsError("payload_too_large", "Upgrade history exceeds the size bound.");
  }

  const safeLimit = Math.min(Math.max(limit, 1), NETWORK_SETTINGS_LIMITS.maxHistoryEntries);
  const rejected = new Set<NetworkId>();
  const own: UpgradeRecord[] = [];

  for (const record of records) {
    if (!isNetworkId(record.network)) {
      throw new NetworkSettingsError("invalid_history", "An upgrade record has no network id.");
    }

    if (record.network !== network) {
      rejected.add(record.network);
      continue;
    }

    if (!Number.isInteger(record.ledger) || record.ledger <= 0) {
      throw new NetworkSettingsError("invalid_history", "Each upgrade needs a positive ledger.");
    }

    if (!Number.isInteger(record.protocolVersion) || record.protocolVersion <= 0) {
      throw new NetworkSettingsError("invalid_history", "Each upgrade needs a positive protocol version.");
    }

    own.push(record);
  }

  const sorted = [...own].sort((left, right) => left.ledger - right.ledger || left.protocolVersion - right.protocolVersion);
  const truncated = sorted.length > safeLimit;
  const kept = truncated ? sorted.slice(sorted.length - safeLimit) : sorted;

  return {
    truncated,
    rejectedNetworks: [...rejected].sort(),
    upgrades: kept.map(toView),
  };
}

function lanes(count: number): string {
  return xdr.ConfigSettingEntry.configSettingContractExecutionLanes(
    new xdr.ConfigSettingContractExecutionLanesV0({ ledgerMaxTxCount: count }),
  ).toXdr("base64");
}

function maxSize(bytes: number): string {
  return xdr.ConfigSettingEntry.configSettingContractMaxSizeBytes(bytes).toXdr("base64");
}

/** Recorded sample used when the caller does not supply its own history. */
export function defaultUpgradeRecords(): UpgradeRecord[] {
  return [
    {
      network: "testnet",
      ledger: 1_000_000,
      protocolVersion: 22,
      upgradeXdr: xdr.LedgerUpgrade.ledgerUpgradeVersion(22).toXdr("base64"),
      entries: [
        { xdr: maxSize(65_536) },
        { xdr: lanes(100) },
      ],
    },
    {
      network: "testnet",
      ledger: 2_000_000,
      protocolVersion: 23,
      upgradeXdr: xdr.LedgerUpgrade.ledgerUpgradeVersion(23).toXdr("base64"),
      entries: [
        { xdr: maxSize(131_072) },
        { xdr: lanes(80) },
      ],
    },
    {
      network: "futurenet",
      ledger: 900,
      protocolVersion: 24,
      upgradeXdr: xdr.LedgerUpgrade.ledgerUpgradeVersion(24).toXdr("base64"),
      entries: [{ xdr: lanes(50) }],
    },
    {
      network: "mainnet",
      ledger: 60_000_000,
      protocolVersion: 23,
      upgradeXdr: xdr.LedgerUpgrade.ledgerUpgradeVersion(23).toXdr("base64"),
      entries: [{ xdr: maxSize(131_072) }],
    },
  ];
}
