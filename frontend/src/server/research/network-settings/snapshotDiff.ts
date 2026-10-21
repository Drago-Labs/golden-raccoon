/**
 * Diff two snapshots of the same network.
 * Unchanged settings are omitted. Increases and decreases stay distinct.
 */

import { assertSameNetwork } from "./networkIdentity";
import type { SettingChange, SettingSnapshot } from "./schema";
import { compareNumeric } from "./units";

function directionFor(before: string, after: string): SettingChange["direction"] {
  const compared = compareNumeric(before, after);

  if (compared === "increase" || compared === "decrease") return compared;

  return "changed";
}

export function diffSnapshots(before: SettingSnapshot, after: SettingSnapshot): SettingChange[] {
  assertSameNetwork(before.network, after.network, "Snapshot diff");

  const beforeMap = new Map(before.settings.map((setting) => [setting.key, setting]));
  const afterMap = new Map(after.settings.map((setting) => [setting.key, setting]));
  const keys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();
  const changes: SettingChange[] = [];

  for (const key of keys) {
    const left = beforeMap.get(key);
    const right = afterMap.get(key);

    if (left && right && left.value === right.value) continue;

    changes.push({
      key,
      name: right?.name ?? left?.name ?? key,
      unit: right?.unit ?? left?.unit ?? "unspecified",
      before: left?.value ?? null,
      after: right?.value ?? null,
      direction: left && right ? directionFor(left.value, right.value) : "changed",
    });
  }

  return changes;
}
