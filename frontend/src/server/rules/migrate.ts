import {
  CURRENT_RULE_SCHEMA_VERSION,
  detectSchemaVersion,
  ruleV1Schema,
  ruleV2Schema,
  SUPPORTED_RULE_SCHEMA_VERSIONS,
  type CurrentRule,
  type RuleV1,
  type RuleV2,
} from "./schema";
import {
  BLOCKABLE_CATEGORIES,
  STRATEGY_PRESET_VERSION,
  STRATEGY_PRESETS,
  type BlockableCategory,
  type StrategyLimits,
} from "./presets";
import { parseBlockedAssetList } from "./assetKeys";
import { resolveChainId, resolveProfileId } from "./strategyProfile";
import { validateRule } from "./validate";
import type { AgentRecommendedAction } from "@/server/types";

export type MigrationErrorCode =
  | "validation_error"
  | "unsupported_schema_version"
  | "unparseable_rule";

export interface MigrationIssue {
  field: string;
  message: string;
}

export class RuleMigrationError extends Error {
  readonly code: MigrationErrorCode;
  readonly status: number;
  readonly issues: MigrationIssue[];

  constructor(code: MigrationErrorCode, message: string, issues: MigrationIssue[] = []) {
    super(message);
    this.name = "RuleMigrationError";
    this.code = code;
    this.status = 400;
    this.issues = issues;
  }
}

export type MigrationOutcome =
  | {
      ok: true;
      rule: CurrentRule;
      fromVersion: number;
      toVersion: number;
      isNoOp: boolean;
    }
  | {
      ok: false;
      code: MigrationErrorCode;
      message: string;
      issues: MigrationIssue[];
    };

/**
 * Losslessly upgrade a version 1 rule record to current schema version 2.
 */
function migrateV1ToCurrent(v1: RuleV1, now = new Date()): CurrentRule {
  const fallback = STRATEGY_PRESETS.balanced.limits;
  const timestamp = now.toISOString();

  const maxBuyRisk = v1.maxBuyRisk ?? v1.maxRiskScore ?? fallback.maxBuyRisk;
  const maxTradePercent = v1.maxTradePercent ?? fallback.maxTradePercent;
  const maxTradeValueUsd = v1.maxTradeValueUsd ?? fallback.maxTradeValueUsd;
  const maxDailyValueUsd = v1.maxDailyValueUsd ?? v1.maxDailyTransactionValueUsd ?? fallback.maxDailyValueUsd;
  const minLiquidityUsd = v1.minLiquidityUsd ?? fallback.minLiquidityUsd;
  const maxSingleTokenExposurePercent = v1.maxSingleTokenExposurePercent ?? fallback.maxSingleTokenExposurePercent;
  const minStableReservePercent = v1.minStableReservePercent ?? fallback.minStableReservePercent;
  const maxMemeExposurePercent = v1.maxMemeExposurePercent ?? fallback.maxMemeExposurePercent;
  const maxSlippageBps = v1.maxSlippageBps ?? fallback.maxSlippageBps;

  const limits: StrategyLimits = {
    maxBuyRisk,
    maxTradePercent,
    maxTradeValueUsd,
    maxDailyValueUsd,
    minLiquidityUsd,
    maxSingleTokenExposurePercent,
    minStableReservePercent,
    maxMemeExposurePercent,
    maxSlippageBps,
  };

  const rawBlocked = [
    ...(v1.blockedAssets ?? []),
    ...(v1.blockedTokens ?? []),
  ];
  const parsedBlocked = parseBlockedAssetList(rawBlocked);

  const rawChains = v1.allowedChains ?? STRATEGY_PRESETS.balanced.allowedChains;
  const resolvedChains: string[] = [];
  for (const item of rawChains) {
    const canonical = resolveChainId(item);
    const candidate = canonical ?? item.trim().toLowerCase();
    if (candidate && !resolvedChains.includes(candidate)) {
      resolvedChains.push(candidate);
    }
  }

  if (resolvedChains.length === 0) {
    resolvedChains.push(...STRATEGY_PRESETS.balanced.allowedChains);
  }

  const validCategories: BlockableCategory[] = [];
  for (const cat of v1.blockedCategories ?? []) {
    const normalized = cat.trim().toLowerCase();
    if (BLOCKABLE_CATEGORIES.includes(normalized as BlockableCategory)) {
      if (!validCategories.includes(normalized as BlockableCategory)) {
        validCategories.push(normalized as BlockableCategory);
      }
    }
  }

  const allowedActions = (v1.allowedActions as AgentRecommendedAction[] | undefined) ?? [
    ...STRATEGY_PRESETS.balanced.allowedActions,
  ];

  const profileId =
    v1.profileId === "conservative" ||
    v1.profileId === "balanced" ||
    v1.profileId === "aggressive" ||
    v1.profileId === "custom"
      ? v1.profileId
      : resolveProfileId("custom", limits);

  const candidateV2: RuleV2 = {
    schemaVersion: CURRENT_RULE_SCHEMA_VERSION,
    walletAddress: v1.walletAddress.trim(),
    profileId,
    presetVersion: STRATEGY_PRESET_VERSION,
    ...limits,
    allowedChains: resolvedChains,
    blockedAssets: parsedBlocked.keys,
    blockedCategories: validCategories.length > 0 ? validCategories : [...STRATEGY_PRESETS.balanced.blockedCategories],
    allowedActions,
    autoExecute: false,
    version: v1.version,
    createdAt: v1.createdAt ?? timestamp,
    updatedAt: v1.updatedAt ?? timestamp,
    maxRiskScore: limits.maxBuyRisk,
    maxDailyTransactionValueUsd: limits.maxDailyValueUsd,
    blockedTokens: [...parsedBlocked.keys],
    blockedIssuers: v1.blockedIssuers ?? [],
    chainFamily: v1.chainFamily,
    network: v1.network,
  };

  return candidateV2;
}

/**
 * Inspect raw input and return migration outcome without throwing.
 */
export function safeMigrateToCurrent(raw: unknown, now = new Date()): MigrationOutcome {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      code: "unparseable_rule",
      message: "Rule payload must be a non-null object",
      issues: [{ field: "(root)", message: "Expected object, received primitive or null" }],
    };
  }

  const detected = detectSchemaVersion(raw);
  if (detected === null) {
    return {
      ok: false,
      code: "unparseable_rule",
      message: "Rule payload cannot be identified as a valid rule shape",
      issues: [{ field: "walletAddress", message: "walletAddress is required and must be non-empty" }],
    };
  }

  if (!SUPPORTED_RULE_SCHEMA_VERSIONS.includes(detected as 1 | 2)) {
    return {
      ok: false,
      code: "unsupported_schema_version",
      message: `Unsupported rule schema version: ${detected}`,
      issues: [
        {
          field: "schemaVersion",
          message: `Version ${detected} is unsupported. Supported versions are ${SUPPORTED_RULE_SCHEMA_VERSIONS.join(", ")}`,
        },
      ],
    };
  }

  if (detected === CURRENT_RULE_SCHEMA_VERSION) {
    const parsedV2 = ruleV2Schema.safeParse(raw);
    if (!parsedV2.success) {
      return {
        ok: false,
        code: "validation_error",
        message: "Rule payload failed schema version 2 validation",
        issues: parsedV2.error.issues.map((i) => ({
          field: i.path.join(".") || "(root)",
          message: i.message,
        })),
      };
    }

    return {
      ok: true,
      rule: parsedV2.data as CurrentRule,
      fromVersion: CURRENT_RULE_SCHEMA_VERSION,
      toVersion: CURRENT_RULE_SCHEMA_VERSION,
      isNoOp: true,
    };
  }

  const parsedV1 = ruleV1Schema.safeParse(raw);
  if (!parsedV1.success) {
    return {
      ok: false,
      code: "validation_error",
      message: "Rule payload failed schema version 1 validation",
      issues: parsedV1.error.issues.map((i) => ({
        field: i.path.join(".") || "(root)",
        message: i.message,
      })),
    };
  }

  const migrated = migrateV1ToCurrent(parsedV1.data, now);
  const validated = validateRule(migrated, now);
  if (!validated.ok) {
    return {
      ok: false,
      code: "validation_error",
      message: `Migrated rule failed schema version 2 validation: ${validated.error}`,
      issues: validated.issues.map((i) => ({
        field: i.field,
        message: i.message,
      })),
    };
  }

  return {
    ok: true,
    rule: validated.rule,
    fromVersion: 1,
    toVersion: CURRENT_RULE_SCHEMA_VERSION,
    isNoOp: false,
  };
}

/**
 * Forward migration chain upgrading any prior rule version to current.
 *
 * Throws RuleMigrationError with structured code and issues on unparseable or
 * unsupported rules.
 */
export function migrateToCurrent(raw: unknown, now = new Date()): CurrentRule {
  const result = safeMigrateToCurrent(raw, now);
  if (!result.ok) {
    throw new RuleMigrationError(result.code, result.message, result.issues);
  }
  return result.rule;
}

export const migrateRule = migrateToCurrent;
export const migrateLegacyRuleRecord = migrateToCurrent;
