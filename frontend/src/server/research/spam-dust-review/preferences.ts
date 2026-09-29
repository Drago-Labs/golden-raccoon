/**
 * Apply wallet-scoped visibility preferences without mutating holdings.
 */
import type { HoldingReview, PreferenceInput, VisibilityPreference } from "./schema";

export function normalizePreferences(
  preferences: PreferenceInput[],
  generatedAt: string,
  validAssetKeys: Set<string>,
): VisibilityPreference[] {
  const byKey = new Map<string, VisibilityPreference>();

  for (const preference of preferences) {
    if (!validAssetKeys.has(preference.assetKey)) continue;
    byKey.set(preference.assetKey, {
      assetKey: preference.assetKey,
      hidden: preference.hidden,
      updatedAt: preference.updatedAt ?? generatedAt,
    });
  }

  return [...byKey.values()].sort((left, right) => left.assetKey.localeCompare(right.assetKey));
}

export function applyHiddenFlag(holdings: HoldingReview[], preferences: VisibilityPreference[]): HoldingReview[] {
  const hiddenKeys = new Set(preferences.filter((preference) => preference.hidden).map((preference) => preference.assetKey));

  return holdings.map((holding) => {
    const hidden = hiddenKeys.has(holding.assetKey);
    return {
      ...holding,
      hidden,
      note: holding.note.includes("Hidden locally")
        ? holding.note
        : hidden
          ? `Hidden locally. ${holding.note}`
          : holding.note,
    };
  });
}
