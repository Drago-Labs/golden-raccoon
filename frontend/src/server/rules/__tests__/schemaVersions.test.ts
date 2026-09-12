import { describe, it, expect } from "vitest";
import {
  CURRENT_RULE_SCHEMA_VERSION,
  detectSchemaVersion,
  strategyRuleV1Schema,
  strategyRuleV2Schema,
  strategyRuleCurrentSchema,
} from "../schema";
import { validLegacyV1Rules, validCurrentV2Rules } from "../__fixtures__/legacy-rules";

describe("Strategy Rule Schema Versions", () => {
  it("defines the current schema version as 2", () => {
    expect(CURRENT_RULE_SCHEMA_VERSION).toBe(2);
  });

  it("detects schema version 1 when schemaVersion is absent", () => {
    expect(detectSchemaVersion(validLegacyV1Rules[0])).toBe(1);
    expect(detectSchemaVersion({ walletAddress: "0x123", maxRiskScore: 50 })).toBe(1);
    expect(detectSchemaVersion({})).toBeNull();
  });

  it("detects schema version 2 when schemaVersion is 2", () => {
    expect(detectSchemaVersion(validCurrentV2Rules[0])).toBe(2);
    expect(detectSchemaVersion({ schemaVersion: 2 })).toBe(2);
  });

  it("returns null for invalid or non-integer versions", () => {
    expect(detectSchemaVersion(null)).toBeNull();
    expect(detectSchemaVersion("string")).toBeNull();
    expect(detectSchemaVersion({ schemaVersion: "two" })).toBeNull();
    expect(detectSchemaVersion({ schemaVersion: -1 })).toBeNull();
    expect(detectSchemaVersion({ schemaVersion: 2.5 })).toBeNull();
  });

  it("validates V1 structure using strategyRuleV1Schema", () => {
    const parsed = strategyRuleV1Schema.safeParse(validLegacyV1Rules[0]);
    expect(parsed.success).toBe(true);
  });

  it("validates V2 structure using strategyRuleV2Schema and strategyRuleCurrentSchema", () => {
    const parsedV2 = strategyRuleV2Schema.safeParse(validCurrentV2Rules[0]);
    expect(parsedV2.success).toBe(true);

    const parsedCurrent = strategyRuleCurrentSchema.safeParse(validCurrentV2Rules[0]);
    expect(parsedCurrent.success).toBe(true);
  });
});
