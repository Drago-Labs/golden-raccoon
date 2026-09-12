import { RULE_SCHEMA_VERSION_V2, ruleV2Schema, type RuleV2 } from "./v2";

export const CURRENT_RULE_SCHEMA_VERSION = RULE_SCHEMA_VERSION_V2;

export const currentRuleSchema = ruleV2Schema;

/**
 * Current canonical shape for persisted strategy rules.
 */
export type CurrentRule = RuleV2;
