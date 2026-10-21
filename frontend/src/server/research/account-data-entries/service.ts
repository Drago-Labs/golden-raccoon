import { coverageNotice } from "./coverage";
import { DataEntryError, type EntryState } from "./errors";
import { buildEntryHistory, type RawManageData } from "./entryHistory";
import { readAccountRecord, readManageDataHistory, type AccountRecord, type HistoryRead, type ReadOutcome } from "./entryReader";
import { detectFormat } from "./formatDetection";
import { DATA_ENTRY_LIMITS } from "./limits";
import type { StellarNetwork } from "./networkIdentity";
import { formatDidChange, isRecentChange } from "./recency";
import { dataEntryReserve } from "./reserveCost";
import {
  DATA_ENTRY_SCHEMA_VERSION,
  dataEntryRequestSchema,
  type DataEntryReport,
  type DataEntryView,
  type DetectedFormat,
} from "./schema";
import { decodeDataValue } from "./valueDecoder";

export type DataEntryDeps = {
  readAccount: (network: StellarNetwork, account: string) => Promise<ReadOutcome<AccountRecord>>;
  readHistory: (network: StellarNetwork, account: string) => Promise<ReadOutcome<HistoryRead>>;
};

const productionDeps: DataEntryDeps = {
  readAccount: readAccountRecord,
  readHistory: readManageDataHistory,
};

function unavailableReport(account: string, network: StellarNetwork, windowLedgers: number, reason: string): DataEntryReport {
  const reserve = dataEntryReserve(0);
  return {
    schemaVersion: DATA_ENTRY_SCHEMA_VERSION,
    account,
    network,
    state: "unavailable",
    observationLedger: null,
    recentWindowLedgers: windowLedgers,
    entries: [],
    entryCount: 0,
    reservePerEntryXlm: reserve.perEntryXlm,
    reserveTotalXlm: reserve.totalXlm,
    historyTruncated: false,
    oldestLedger: null,
    coverageNotice: `${coverageNotice("unavailable", null)} ${reason}`,
    readOnly: true,
    writesEntries: false,
  };
}

function viewFor(
  key: string,
  currentBase64: string | undefined,
  history: DataEntryView["history"],
  observationLedger: number | null,
  windowLedgers: number,
): DataEntryView {
  const present = currentBase64 !== undefined;
  const decoded = present ? decodeDataValue(currentBase64) : null;
  const formats = history.map((event) => event.format).filter((format): format is DetectedFormat => format !== null);
  let formatChanged = false;
  for (let index = 1; index < formats.length; index += 1) {
    if (formatDidChange(formats[index - 1] ?? null, formats[index] ?? null)) formatChanged = true;
  }
  const newest = history[history.length - 1];
  return {
    key,
    present,
    base64: present ? currentBase64 : null,
    hex: decoded?.hex ?? null,
    utf8: decoded?.text ? decoded.utf8 : null,
    format: decoded ? detectFormat(decoded) : null,
    recent: isRecentChange(newest?.ledger ?? null, observationLedger, windowLedgers),
    formatChanged,
    history,
  };
}

/**
 * Read manageData entries and their history. Values are decoded as bytes first.
 * The service never writes an entry or signs a transaction.
 */
export async function inspectDataEntries(input: unknown, deps: DataEntryDeps = productionDeps): Promise<DataEntryReport> {
  const parsed = dataEntryRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new DataEntryError("invalid_request", "The data-entry request is invalid.", parsed.error.flatten());
  }

  const { account, network, recentWindowLedgers } = parsed.data;
  const accountRead = await deps.readAccount(network, account);
  if (accountRead.status === "unavailable") return unavailableReport(account, network, recentWindowLedgers, accountRead.reason);
  if (accountRead.status === "missing") {
    throw new DataEntryError("not_found", "No account was recorded for this id on the selected network.");
  }

  const historyRead = await deps.readHistory(network, account);
  const reasons: string[] = [];
  let operations: RawManageData[] = [];
  let historyTruncated = false;
  let oldestLedger: number | null = null;
  if (historyRead.status === "ok") {
    operations = historyRead.value.operations;
    historyTruncated = historyRead.value.truncated;
    oldestLedger = historyRead.value.oldestLedger;
    if (historyTruncated) reasons.push("manage_data history was truncated.");
  } else {
    historyTruncated = true;
    reasons.push(historyRead.status === "missing" ? "No manage_data history was returned." : "manage_data history was unavailable.");
  }

  const history = buildEntryHistory(operations);
  const keys = [...new Set([...Object.keys(accountRead.value.data), ...history.keys()])].sort();
  const shown = keys.slice(0, DATA_ENTRY_LIMITS.maxEntries);
  if (shown.length < keys.length) reasons.push("The entry list was truncated at the entry limit.");

  const entries = shown.map((key) =>
    viewFor(key, accountRead.value.data[key], history.get(key) ?? [], accountRead.value.observationLedger, recentWindowLedgers),
  );
  const presentCount = entries.filter((entry) => entry.present).length;
  const reserve = dataEntryReserve(presentCount);
  const state: EntryState = reasons.length > 0 ? "partial" : "complete";

  return {
    schemaVersion: DATA_ENTRY_SCHEMA_VERSION,
    account,
    network,
    state,
    observationLedger: accountRead.value.observationLedger,
    recentWindowLedgers,
    entries,
    entryCount: presentCount,
    reservePerEntryXlm: reserve.perEntryXlm,
    reserveTotalXlm: reserve.totalXlm,
    historyTruncated,
    oldestLedger,
    coverageNotice: coverageNotice(state, oldestLedger),
    readOnly: true,
    writesEntries: false,
  };
}
