/**
 * Decode ConfigSettingEntry XDR into named settings with units.
 * Unknown setting ids are kept and shown as raw hex.
 */

import { xdr } from "@stellar/stellar-sdk";
import { NetworkSettingsError } from "./errors";
import { describeSetting } from "./settingCatalogue";
import type { DecodedSetting } from "./schema";
import { formatSettingValue } from "./units";

const CONFIG_SETTING_ENTRY_TYPE = 8;

type CostParam = {
  constTerm: bigint;
  linearTerm: bigint;
  ext?: { v?: number };
};

type SettingEntryLike = {
  toXdrObject(): { configSettingID: number } & Record<string, unknown>;
};

function isCostParam(value: unknown): value is CostParam {
  return Boolean(value) && typeof value === "object" && "constTerm" in value && "linearTerm" in value;
}

function costTypeName(index: number): string {
  try {
    return xdr.ContractCostType.fromValue(index).name;
  } catch {
    return `costType.${index}`;
  }
}

function walk(path: string, value: unknown): Array<{ key: string; value: string }> {
  if (typeof value === "bigint" || typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return [{ key: path, value: formatSettingValue(value) }];
  }

  if (value instanceof Uint8Array) {
    return [{ key: path, value: Buffer.from(value).toString("hex") }];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return [{ key: path, value: "0" }];

    if (isCostParam(value[0])) {
      return value.flatMap((entry, index) => {
        const name = costTypeName(index);
        const rows = [
          { key: `${path}.${name}.constTerm`, value: formatSettingValue(entry.constTerm) },
          { key: `${path}.${name}.linearTerm`, value: formatSettingValue(entry.linearTerm) },
        ];

        if (entry.ext && entry.ext.v !== 0) {
          rows.push({ key: `${path}.${name}.ext`, value: JSON.stringify(entry.ext) });
        }

        return rows;
      });
    }

    return value.flatMap((item, index) => walk(`${path}.${index}`, item));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => {
      if (key === "ext" && inner && typeof inner === "object" && (inner as { v?: number }).v === 0) {
        return [];
      }

      return walk(`${path}.${key}`, inner);
    });
  }

  return [{ key: path, value: String(value) }];
}

function readSettingEntry(value: unknown): SettingEntryLike {
  if (!value || typeof value !== "object" || !("toXdrObject" in value)) {
    throw new NetworkSettingsError("decode_failed", "Config setting value could not be read.");
  }

  return value as SettingEntryLike;
}

function asConfigSetting(xdrBase64: string): SettingEntryLike | null {
  if (xdr.ConfigSettingEntry.validateXdr(xdrBase64, "base64")) {
    return xdr.ConfigSettingEntry.fromXdr(xdrBase64, "base64");
  }

  if (xdr.LedgerEntryData.validateXdr(xdrBase64, "base64")) {
    const data = xdr.LedgerEntryData.fromXdr(xdrBase64, "base64");

    if (data.type !== "configSetting") {
      throw new NetworkSettingsError("not_config_setting", "Ledger entry is not a config setting.");
    }

    return readSettingEntry(data.value);
  }

  if (xdr.LedgerEntry.validateXdr(xdrBase64, "base64")) {
    const ledger = xdr.LedgerEntry.fromXdr(xdrBase64, "base64");

    if (ledger.data.type !== "configSetting") {
      throw new NetworkSettingsError("not_config_setting", "Ledger entry is not a config setting.");
    }

    return readSettingEntry(ledger.data.value);
  }

  return null;
}

function rawSetting(xdrBase64: string): DecodedSetting[] {
  const bytes = Buffer.from(xdrBase64, "base64");

  if (bytes.length < 4) {
    throw new NetworkSettingsError("decode_failed", "Config setting XDR is too short to contain a setting id.");
  }

  let settingId = bytes.readInt32BE(0);
  let payload = bytes.subarray(4);

  if (bytes.length >= 12 && bytes.readInt32BE(4) === CONFIG_SETTING_ENTRY_TYPE) {
    settingId = bytes.readInt32BE(8);
    payload = bytes.subarray(12);
  } else if (bytes.readInt32BE(0) === CONFIG_SETTING_ENTRY_TYPE && bytes.length >= 8) {
    settingId = bytes.readInt32BE(4);
    payload = bytes.subarray(8);
  }

  const described = describeSetting(`configSetting.${settingId}`, settingId, false);

  return [
    {
      key: `configSetting.${settingId}`,
      settingId,
      name: described.name,
      value: Buffer.from(payload).toString("hex"),
      unit: described.unit,
      known: false,
    },
  ];
}

function flatten(entry: SettingEntryLike): DecodedSetting[] {
  const wire = entry.toXdrObject();
  const settingId = Number(wire.configSettingID);
  const payloadKey = Object.keys(wire).find((key) => key !== "configSettingID");

  if (!payloadKey) {
    throw new NetworkSettingsError("decode_failed", "Config setting has no value.");
  }

  const rows = walk(payloadKey, wire[payloadKey]).sort((left, right) => left.key.localeCompare(right.key));

  return rows.map((row) => {
    const described = describeSetting(row.key, settingId, true);

    return {
      key: row.key,
      settingId,
      name: described.name,
      value: row.value,
      unit: described.unit,
      known: true,
    };
  });
}

/** Decode one ConfigSettingEntry, LedgerEntryData, or LedgerEntry XDR value. */
export function decodeConfigSettingXdr(xdrBase64: string): DecodedSetting[] {
  if (xdrBase64.length === 0) {
    throw new NetworkSettingsError("decode_failed", "Config setting XDR is empty.");
  }

  const entry = asConfigSetting(xdrBase64);

  if (!entry) return rawSetting(xdrBase64);

  return flatten(entry);
}

/** Decode every entry. Duplicate keys are refused so a value cannot hide another. */
export function decodeConfigSettings(entries: readonly string[]): DecodedSetting[] {
  const decoded = entries.flatMap((entry) => decodeConfigSettingXdr(entry));
  const seen = new Set<string>();

  for (const setting of decoded) {
    if (seen.has(setting.key)) {
      throw new NetworkSettingsError("decode_failed", `Setting ${setting.key} was returned more than once.`);
    }

    seen.add(setting.key);
  }

  return decoded.sort((left, right) => left.settingId - right.settingId || left.key.localeCompare(right.key));
}
