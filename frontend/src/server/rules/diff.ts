import type { CurrentRule } from "./schema";

export type FieldDiffKind = "modified" | "added" | "removed" | "unchanged";

export interface FieldDiff {
  field: string;
  label: string;
  kind: FieldDiffKind;
  previousValue: unknown;
  currentValue: unknown;
  previous?: unknown;
  current?: unknown;
  before?: unknown;
  after?: unknown;
  unit?: string;
  addedItems?: string[];
  removedItems?: string[];
  added?: string[];
  removed?: string[];
  summary: string;
}

export interface RuleDiff {
  hasChanges: boolean;
  hasDifferences: boolean;
  changedFieldCount: number;
  totalChangedFields: number;
  diffs: FieldDiff[];
  scalarChanges: FieldDiff[];
  arrayChanges: FieldDiff[];
  summary: string;
}

const FIELD_LABELS: Record<string, string> = {
  profileId: "Strategy Profile",
  presetVersion: "Preset Version",
  maxBuyRisk: "Max Buy Risk",
  maxTradePercent: "Max Trade Percent",
  maxTradeValueUsd: "Max Trade Value USD",
  maxDailyValueUsd: "Max Daily Value USD",
  minLiquidityUsd: "Min Liquidity USD",
  maxSingleTokenExposurePercent: "Max Single Token Exposure Percent",
  minStableReservePercent: "Min Stable Reserve Percent",
  maxMemeExposurePercent: "Max Meme Exposure Percent",
  maxSlippageBps: "Max Slippage Basis Points",
  allowedChains: "Allowed Chains",
  blockedAssets: "Blocked Assets",
  blockedCategories: "Blocked Categories",
  allowedActions: "Allowed Actions",
  autoExecute: "Auto Execute",
};

const SCALAR_FIELDS = [
  "profileId",
  "presetVersion",
  "maxBuyRisk",
  "maxTradePercent",
  "maxTradeValueUsd",
  "maxDailyValueUsd",
  "minLiquidityUsd",
  "maxSingleTokenExposurePercent",
  "minStableReservePercent",
  "maxMemeExposurePercent",
  "maxSlippageBps",
  "autoExecute",
] as const;

const ARRAY_FIELDS = [
  "allowedChains",
  "blockedAssets",
  "blockedCategories",
  "allowedActions",
] as const;

function formatValue(value: unknown): string {
  if (value === undefined) return "(none)";
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.join(", ")}]`;
  return String(value);
}

/**
 * Compare two rule records and generate a structured diff naming all changed fields.
 */
export function calculateRuleDiff(
  previous: Partial<CurrentRule> | null | undefined,
  current: Partial<CurrentRule> | null | undefined,
): RuleDiff {
  const prev = (previous ?? {}) as Record<string, unknown>;
  const next = (current ?? {}) as Record<string, unknown>;
  const diffs: FieldDiff[] = [];

  for (const field of SCALAR_FIELDS) {
    const prevVal = prev[field];
    const nextVal = next[field];

    if (prevVal === nextVal) continue;
    if (prevVal === undefined && nextVal === undefined) continue;

    let kind: FieldDiffKind = "modified";
    if (prevVal === undefined) kind = "added";
    else if (nextVal === undefined) kind = "removed";

    const label = FIELD_LABELS[field] ?? field;
    const summary =
      kind === "added"
        ? `${label} set to ${formatValue(nextVal)}`
        : kind === "removed"
          ? `${label} removed (was ${formatValue(prevVal)})`
          : `${label} changed from ${formatValue(prevVal)} to ${formatValue(nextVal)}`;

function inferUnit(field: string): string | undefined {
  if (field.endsWith("Percent") || field === "maxBuyRisk") return "%";
  if (field.endsWith("Usd")) return "USD";
  if (field.endsWith("Bps")) return "bps";
  return undefined;
}

    diffs.push({
      field,
      label,
      kind,
      previousValue: prevVal,
      currentValue: nextVal,
      previous: prevVal,
      current: nextVal,
      before: prevVal,
      after: nextVal,
      unit: inferUnit(field),
      summary,
    });
  }

  for (const field of ARRAY_FIELDS) {
    const rawPrev = Array.isArray(prev[field]) ? (prev[field] as string[]) : [];
    const rawNext = Array.isArray(next[field]) ? (next[field] as string[]) : [];

    const prevItems = [...new Set(rawPrev.map(String))].sort();
    const nextItems = [...new Set(rawNext.map(String))].sort();

    const addedItems = nextItems.filter((item) => !prevItems.includes(item));
    const removedItems = prevItems.filter((item) => !nextItems.includes(item));

    if (addedItems.length === 0 && removedItems.length === 0) continue;

    let kind: FieldDiffKind = "modified";
    if (prevItems.length === 0) kind = "added";
    else if (nextItems.length === 0) kind = "removed";

    const label = FIELD_LABELS[field] ?? field;
    const parts: string[] = [];
    if (addedItems.length > 0) parts.push(`added: [${addedItems.join(", ")}]`);
    if (removedItems.length > 0) parts.push(`removed: [${removedItems.join(", ")}]`);
    const summary = `${label} ${parts.join("; ")}`;

    diffs.push({
      field,
      label,
      kind,
      previousValue: prevItems,
      currentValue: nextItems,
      previous: prevItems,
      current: nextItems,
      before: prevItems,
      after: nextItems,
      addedItems,
      removedItems,
      added: addedItems,
      removed: removedItems,
      summary,
    });
  }

  const hasChanges = diffs.length > 0;
  const changedFieldCount = diffs.length;
  const scalarChanges = diffs.filter((d) => d.addedItems === undefined && d.removedItems === undefined);
  const arrayChanges = diffs.filter((d) => d.addedItems !== undefined || d.removedItems !== undefined);
  const summary = hasChanges
    ? `${changedFieldCount} field${changedFieldCount === 1 ? "" : "s"} changed: ${diffs.map((d) => d.label).join(", ")}`
    : "No changes detected";

  return {
    hasChanges,
    hasDifferences: hasChanges,
    changedFieldCount,
    totalChangedFields: changedFieldCount,
    diffs,
    scalarChanges,
    arrayChanges,
    summary,
  };
}

export const diffRules = calculateRuleDiff;

export function formatRuleDiffSummary(result: RuleDiff): string {
  return result.summary;
}
