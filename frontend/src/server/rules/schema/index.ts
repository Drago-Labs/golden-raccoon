import { RULE_SCHEMA_VERSION_V1, ruleV1Schema, type RuleV1 } from "./v1";
import {
  RULE_SCHEMA_VERSION_V2,
  ruleV2Schema,
  type RuleV2,
  ALLOWED_RULE_ACTIONS,
} from "./v2";
import {
  CURRENT_RULE_SCHEMA_VERSION,
  currentRuleSchema,
  type CurrentRule,
} from "./current";

export {
  RULE_SCHEMA_VERSION_V1,
  ruleV1Schema,
  type RuleV1,
  RULE_SCHEMA_VERSION_V2,
  ruleV2Schema,
  type RuleV2,
  ALLOWED_RULE_ACTIONS,
  CURRENT_RULE_SCHEMA_VERSION,
  currentRuleSchema,
  type CurrentRule,
};

export const strategyRuleV1Schema = ruleV1Schema;
export const strategyRuleV2Schema = ruleV2Schema;
export const strategyRuleCurrentSchema = currentRuleSchema;

export const SUPPORTED_RULE_SCHEMA_VERSIONS = [1, 2] as const;
export type SupportedRuleSchemaVersion = (typeof SUPPORTED_RULE_SCHEMA_VERSIONS)[number];

/**
 * Detect the schema version of a raw rule object.
 *
 * Returns 1 for legacy unversioned rule objects containing standard rule keys.
 * Returns null if the object is malformed or not an identifiable rule shape.
 */
export function detectSchemaVersion(raw: unknown): number | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;

  if (typeof record.schemaVersion === "number") {
    if (Number.isInteger(record.schemaVersion) && record.schemaVersion > 0) {
      return record.schemaVersion;
    }
    return null;
  }

  if (typeof record.walletAddress === "string" && record.walletAddress.trim().length > 0) {
    return 1;
  }

  return null;
}
