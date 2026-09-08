import { describe, it, expect } from "vitest";
import {
  migrateRule,
  migrateLegacyRuleRecord,
  RuleMigrationError,
} from "../migrate";
import { CURRENT_RULE_SCHEMA_VERSION } from "../schema";
import { STRATEGY_PRESETS } from "../presets";
import {
  validLegacyV1Rules,
  validCurrentV2Rules,
  unparseableRuleFixtures,
} from "../__fixtures__/legacy-rules";

describe("Rule Forward Migration Chain", () => {
  it("migrates a V1 legacy rule to the current V2 schema", () => {
    const legacy = validLegacyV1Rules[0];
    const migrated = migrateRule(legacy);

    expect(migrated.schemaVersion).toBe(CURRENT_RULE_SCHEMA_VERSION);
    expect(migrated.walletAddress).toBe(legacy.walletAddress);
    expect(migrated.maxBuyRisk).toBe(legacy.maxRiskScore);
    expect(migrated.maxDailyValueUsd).toBe(legacy.maxDailyTransactionValueUsd);
    expect(migrated.blockedAssets).toEqual(legacy.blockedTokens);
    expect(migrated.allowedActions).toEqual([...STRATEGY_PRESETS.balanced.allowedActions]);
    expect(migrated.autoExecute).toBe(false);
  });

  it("is strictly idempotent when migrating an already current V2 rule", () => {
    const current = validCurrentV2Rules[0];
    const migratedFirst = migrateRule(current);
    const migratedSecond = migrateRule(migratedFirst);

    expect(migratedFirst).toEqual(current);
    expect(migratedSecond).toEqual(current);
  });

  it("normalizes legacy chain identifiers", () => {
    const migrated = migrateRule({
      walletAddress: "0x1234567890123456789012345678901234567890",
      allowedChains: ["base", "stellar:testnet"],
    });

    expect(migrated.allowedChains).toEqual(["base", "stellar-testnet"]);
  });

  it("drops unparseable legacy blocked entries while keeping valid ones", () => {
    const migrated = migrateLegacyRuleRecord({
      walletAddress: "0x1234567890123456789012345678901234567890",
      blockedTokens: ["invalid-asset", "evm:base:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],
    });

    expect(migrated.blockedAssets).toEqual([
      "evm:base:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    ]);
  });

  it("throws RuleMigrationError with typed details on unparseable inputs", () => {
    for (const fixture of unparseableRuleFixtures) {
      expect(() => migrateRule(fixture)).toThrow(RuleMigrationError);
    }
  });

  it("throws RuleMigrationError when schema version is unsupported", () => {
    expect(() =>
      migrateRule({
        schemaVersion: 999,
        walletAddress: "0x1234567890123456789012345678901234567890",
      }),
    ).toThrow(RuleMigrationError);
  });

  it("never returns a partially populated object when migration fails", () => {
    let result: unknown = "not_executed";
    try {
      result = migrateRule({ schemaVersion: 999 });
    } catch (error) {
      expect(error).toBeInstanceOf(RuleMigrationError);
    }
    expect(result).toBe("not_executed");
  });
});
