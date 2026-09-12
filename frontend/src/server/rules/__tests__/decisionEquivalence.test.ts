import { describe, it, expect } from "vitest";
import { evaluateStrategy, type StrategyEnforcerContext } from "../../agents/strategy";
import { migrateRule } from "../migrate";
import { validLegacyV1Rules } from "../__fixtures__/legacy-rules";
import type { UserRule } from "@/server/types";

describe("Strategy Decision Equivalence Across Migration", () => {
  const contexts: StrategyEnforcerContext[] = [
    {
      action: "prepare_transaction",
      riskScore: 30,
      percent: 8,
      estimatedValueUsd: 800,
      network: "base",
      phase: "execution",
    },
    {
      action: "prepare_transaction",
      riskScore: 50,
      percent: 8,
      estimatedValueUsd: 800,
      network: "base",
      phase: "execution",
    },
    {
      action: "prepare_transaction",
      riskScore: 20,
      percent: 25,
      estimatedValueUsd: 800,
      network: "base",
      phase: "execution",
    },
    {
      action: "prepare_transaction",
      riskScore: 20,
      percent: 5,
      estimatedValueUsd: 6000,
      network: "base",
      phase: "execution",
    },
    {
      action: "prepare_transaction",
      riskScore: 20,
      percent: 5,
      estimatedValueUsd: 500,
      network: "ethereum",
      phase: "execution",
    },
  ];

  it("produces identical evaluation decisions between legacy V1 rule and migrated V2 rule", () => {
    for (const legacyRule of validLegacyV1Rules) {
      const migratedRule = migrateRule(legacyRule);

      for (const ctx of contexts) {
        const legacyResult = evaluateStrategy(ctx, legacyRule as unknown as UserRule);
        const migratedResult = evaluateStrategy(ctx, migratedRule as unknown as UserRule);

        expect(migratedResult.allowed).toBe(legacyResult.allowed);
        expect(migratedResult.violations.length).toBe(legacyResult.violations.length);

        const legacyCategories = legacyResult.violations.map((v) => v.ruleCategory).sort();
        const migratedCategories = migratedResult.violations.map((v) => v.ruleCategory).sort();
        expect(migratedCategories).toEqual(legacyCategories);
      }
    }
  });
});
