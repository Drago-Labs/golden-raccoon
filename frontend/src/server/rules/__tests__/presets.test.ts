import { describe, it, expect } from "vitest";
import {
  STRATEGY_PRESETS,
  listStrategyPresets,
} from "../presets";
import { buildProfileFromPreset, getDefaultRules } from "../strategyProfile";
import { validateRule } from "../validate";

describe("Bundled Presets and Default Rules Validation", () => {
  it("validates that all bundled presets pass current-schema validation", () => {
    const presets = listStrategyPresets();
    expect(presets.length).toBeGreaterThanOrEqual(3);

    for (const preset of presets) {
      const profile = buildProfileFromPreset(
        "0x1111111111111111111111111111111111111111",
        preset.id,
      );
      const validation = validateRule(profile);

      expect(validation.ok).toBe(true);
      expect(validation.issues).toHaveLength(0);
      expect(validation.rule?.schemaVersion).toBe(2);
    }
  });

  it("validates that default rules pass current-schema validation", () => {
    const defaultRules = getDefaultRules("0x1111111111111111111111111111111111111111");
    const validation = validateRule(defaultRules);

    expect(validation.ok).toBe(true);
    expect(validation.issues).toHaveLength(0);
    expect(validation.rule?.schemaVersion).toBe(2);
  });

  it("verifies preset cross-field constraints", () => {
    for (const key of Object.keys(STRATEGY_PRESETS) as Array<keyof typeof STRATEGY_PRESETS>) {
      const preset = STRATEGY_PRESETS[key];
      const sum = preset.limits.minStableReservePercent + preset.limits.maxTradePercent;
      expect(sum).toBeLessThanOrEqual(100);
    }
  });
});
