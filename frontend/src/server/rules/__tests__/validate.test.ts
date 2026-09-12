import { describe, it, expect } from "vitest";
import { validateRule } from "../validate";
import { validCurrentV2Rules } from "../__fixtures__/legacy-rules";

describe("Unified Strategy Rule Validator", () => {
  const baseValid = validCurrentV2Rules[0];

  it("accepts a completely valid V2 rule", () => {
    const result = validateRule(baseValid);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.rule?.schemaVersion).toBe(2);
  });

  it("rejects out-of-bounds percentage values", () => {
    const highRisk = validateRule({ ...baseValid, maxBuyRisk: 101 });
    expect(highRisk.ok).toBe(false);
    expect(highRisk.issues.some((i) => i.field === "maxBuyRisk")).toBe(true);

    const negativeTrade = validateRule({ ...baseValid, maxTradePercent: -1 });
    expect(negativeTrade.ok).toBe(false);
    expect(negativeTrade.issues.some((i) => i.field === "maxTradePercent")).toBe(true);
  });

  it("rejects out-of-bounds slippage in bps", () => {
    const highSlippage = validateRule({ ...baseValid, maxSlippageBps: 10001 });
    expect(highSlippage.ok).toBe(false);
    expect(highSlippage.issues.some((i) => i.field === "maxSlippageBps")).toBe(true);
  });

  it("rejects unknown chains and unknown categories", () => {
    const badChain = validateRule({ ...baseValid, allowedChains: ["non-existent-chain"] });
    expect(badChain.ok).toBe(false);
    expect(badChain.issues.some((i) => i.field.startsWith("allowedChains"))).toBe(true);

    const badCategory = validateRule({ ...baseValid, blockedCategories: ["unknown_category_abc"] });
    expect(badCategory.ok).toBe(false);
    expect(badCategory.issues.some((i) => i.field.startsWith("blockedCategories"))).toBe(true);
  });

  it("rejects invalid asset keys", () => {
    const badAsset = validateRule({ ...baseValid, blockedAssets: ["0xnotanassetkey"] });
    expect(badAsset.ok).toBe(false);
    expect(badAsset.issues.some((i) => i.field.startsWith("blockedAssets"))).toBe(true);
  });

  it("enforces cross-field constraint between stable reserve and max trade percent", () => {
    const impossibleReserve = validateRule({
      ...baseValid,
      minStableReservePercent: 80,
      maxTradePercent: 30,
    });
    expect(impossibleReserve.ok).toBe(false);
    expect(
      impossibleReserve.issues.some((i) => i.field === "maxTradePercent" || i.field === "minStableReservePercent"),
    ).toBe(true);
  });

  it("strictly rejects autoExecute being true", () => {
    const autoExec = validateRule({ ...baseValid, autoExecute: true });
    expect(autoExec.ok).toBe(false);
    expect(autoExec.issues.some((i) => i.field === "autoExecute")).toBe(true);
  });

  it("generates non-blocking warnings for dominated limits", () => {
    const dominated = validateRule({
      ...baseValid,
      maxSingleTokenExposurePercent: 10,
      maxMemeExposurePercent: 25,
    });
    expect(dominated.ok).toBe(true);
    expect(dominated.warnings.some((w) => w.field === "maxMemeExposurePercent")).toBe(true);
  });
});
