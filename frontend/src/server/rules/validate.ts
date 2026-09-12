import {
  CURRENT_RULE_SCHEMA_VERSION,
  type CurrentRule,
} from "./schema";
import {
  BLOCKABLE_CATEGORIES,
  STRATEGY_PRESET_VERSION,
  STRATEGY_PRESETS,
  type BlockableCategory,
  type StrategyLimits,
  type StrategyProfileId,
} from "./presets";
import { parseBlockedAssetList } from "./assetKeys";
import { resolveChainId, resolveProfileId } from "./strategyProfile";
import { ALLOWED_RULE_ACTIONS } from "./schema/v2";
import type { AgentRecommendedAction } from "@/server/types";

export interface RuleValidationIssue {
  field: string;
  message: string;
}

export class RuleValidationError extends Error {
  readonly code = "validation_error" as const;
  readonly status = 400;
  readonly issues: RuleValidationIssue[];

  constructor(message: string, issues: RuleValidationIssue[] = []) {
    super(message);
    this.name = "RuleValidationError";
    this.issues = issues;
  }
}

export type RuleValidationResult =
  | {
      ok: true;
      rule: CurrentRule;
      issues: RuleValidationIssue[];
      warnings: RuleValidationIssue[];
    }
  | {
      ok: false;
      code: "validation_error";
      error: string;
      issues: RuleValidationIssue[];
    };

/**
 * Unified rule validator shared by API route, engine, and authoring form.
 *
 * Enforces bounds, enums, cross-field constraints, and security invariants.
 */
export function validateRule(payload: unknown, now = new Date()): RuleValidationResult {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return {
      ok: false,
      code: "validation_error",
      error: "Rule payload must be a non-null object",
      issues: [{ field: "(root)", message: "Expected object, received primitive or null" }],
    };
  }

  const raw = payload as Record<string, unknown>;
  const issues: RuleValidationIssue[] = [];
  const warnings: RuleValidationIssue[] = [];

  const rawWallet = typeof raw.walletAddress === "string" ? raw.walletAddress.trim() : "";
  if (!rawWallet) {
    issues.push({ field: "walletAddress", message: "walletAddress is required" });
  }

  if (raw.autoExecute === true) {
    issues.push({
      field: "autoExecute",
      message: "Automatic execution cannot be enabled; wallet approval is mandatory",
    });
  }

  const parsePercent = (val: unknown, field: string): number => {
    if (typeof val !== "number" || !Number.isFinite(val) || val < 0 || val > 100) {
      issues.push({ field, message: `${field} must be a number between 0 and 100` });
      return 0;
    }
    return val;
  };

  const parseUsd = (val: unknown, field: string): number => {
    if (typeof val !== "number" || !Number.isFinite(val) || val < 0 || val > 1_000_000_000) {
      issues.push({ field, message: `${field} must be a number between 0 and 1,000,000,000` });
      return 0;
    }
    return val;
  };

  const parseBps = (val: unknown, field: string): number => {
    if (typeof val !== "number" || !Number.isInteger(val) || val < 0 || val > 10_000) {
      issues.push({ field, message: `${field} must be an integer between 0 and 10,000` });
      return 0;
    }
    return val;
  };

  const fallback = STRATEGY_PRESETS.balanced.limits;

  const maxBuyRisk = parsePercent(raw.maxBuyRisk ?? raw.maxRiskScore ?? fallback.maxBuyRisk, "maxBuyRisk");
  const maxTradePercent = parsePercent(raw.maxTradePercent ?? fallback.maxTradePercent, "maxTradePercent");
  const maxSingleTokenExposurePercent = parsePercent(
    raw.maxSingleTokenExposurePercent ?? fallback.maxSingleTokenExposurePercent,
    "maxSingleTokenExposurePercent",
  );
  const minStableReservePercent = parsePercent(
    raw.minStableReservePercent ?? fallback.minStableReservePercent,
    "minStableReservePercent",
  );
  const maxMemeExposurePercent = parsePercent(
    raw.maxMemeExposurePercent ?? fallback.maxMemeExposurePercent,
    "maxMemeExposurePercent",
  );

  const maxTradeValueUsd = parseUsd(raw.maxTradeValueUsd ?? fallback.maxTradeValueUsd, "maxTradeValueUsd");
  const maxDailyValueUsd = parseUsd(
    raw.maxDailyValueUsd ?? raw.maxDailyTransactionValueUsd ?? fallback.maxDailyValueUsd,
    "maxDailyValueUsd",
  );
  const minLiquidityUsd = parseUsd(raw.minLiquidityUsd ?? fallback.minLiquidityUsd, "minLiquidityUsd");

  const maxSlippageBps = parseBps(raw.maxSlippageBps ?? fallback.maxSlippageBps, "maxSlippageBps");

  if (minStableReservePercent + maxTradePercent > 100) {
    issues.push({
      field: "minStableReservePercent",
      message: "Minimum stable reserve plus max trade percent cannot exceed 100%",
    });
  }

  if (maxMemeExposurePercent > maxSingleTokenExposurePercent) {
    warnings.push({
      field: "maxMemeExposurePercent",
      message: "Meme exposure cap is above the single-token cap, so the single-token cap binds first",
    });
  }

  const rawChains = Array.isArray(raw.allowedChains) ? raw.allowedChains : [];
  if (rawChains.length === 0) {
    issues.push({ field: "allowedChains", message: "At least one chain must be allowed" });
  }

  const allowedChains: string[] = [];
  for (let i = 0; i < rawChains.length; i++) {
    const item = rawChains[i];
    if (typeof item !== "string" || !item.trim()) {
      issues.push({ field: `allowedChains[${i}]`, message: "Chain name must be a non-empty string" });
      continue;
    }
    const resolved = resolveChainId(item);
    if (!resolved) {
      issues.push({ field: `allowedChains[${i}]`, message: `Unknown chain "${item}"` });
      continue;
    }
    if (!allowedChains.includes(resolved)) {
      allowedChains.push(resolved);
    }
  }

  const rawBlocked = Array.isArray(raw.blockedAssets)
    ? raw.blockedAssets
    : Array.isArray(raw.blockedTokens)
      ? raw.blockedTokens
      : [];
  const parsedBlocked = parseBlockedAssetList(rawBlocked.map(String));
  for (const err of parsedBlocked.errors) {
    issues.push({ field: "blockedAssets", message: `${err.input}: ${err.message}` });
  }

  const rawCategories = Array.isArray(raw.blockedCategories) ? raw.blockedCategories : [];
  const blockedCategories: BlockableCategory[] = [];
  for (let i = 0; i < rawCategories.length; i++) {
    const cat = String(rawCategories[i]).trim().toLowerCase();
    if (!BLOCKABLE_CATEGORIES.includes(cat as BlockableCategory)) {
      issues.push({ field: `blockedCategories[${i}]`, message: `Unknown category "${rawCategories[i]}"` });
      continue;
    }
    if (!blockedCategories.includes(cat as BlockableCategory)) {
      blockedCategories.push(cat as BlockableCategory);
    }
  }

  const rawActions = Array.isArray(raw.allowedActions)
    ? raw.allowedActions
    : [...STRATEGY_PRESETS.balanced.allowedActions];
  const allowedActions: AgentRecommendedAction[] = [];
  for (let i = 0; i < rawActions.length; i++) {
    const act = String(rawActions[i]).trim().toLowerCase();
    if (!ALLOWED_RULE_ACTIONS.includes(act as (typeof ALLOWED_RULE_ACTIONS)[number])) {
      issues.push({ field: `allowedActions[${i}]`, message: `Unknown action "${rawActions[i]}"` });
      continue;
    }
    if (!allowedActions.includes(act as AgentRecommendedAction)) {
      allowedActions.push(act as AgentRecommendedAction);
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      code: "validation_error",
      error: issues[0].message,
      issues,
    };
  }

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

  const requestedProfile = (typeof raw.profileId === "string" ? raw.profileId : "custom") as StrategyProfileId;
  const profileId = resolveProfileId(requestedProfile, limits);
  const timestamp = now.toISOString();

  const rule: CurrentRule = {
    schemaVersion: CURRENT_RULE_SCHEMA_VERSION,
    walletAddress: rawWallet,
    profileId,
    presetVersion: typeof raw.presetVersion === "number" ? raw.presetVersion : STRATEGY_PRESET_VERSION,
    ...limits,
    allowedChains,
    blockedAssets: parsedBlocked.keys,
    blockedCategories,
    allowedActions,
    autoExecute: false,
    version: typeof raw.version === "number" ? raw.version : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : timestamp,
    updatedAt: timestamp,
    maxRiskScore: limits.maxBuyRisk,
    maxDailyTransactionValueUsd: limits.maxDailyValueUsd,
    blockedTokens: [...parsedBlocked.keys],
    blockedIssuers: Array.isArray(raw.blockedIssuers) ? raw.blockedIssuers.map(String) : [],
    chainFamily: raw.chainFamily === "evm" || raw.chainFamily === "stellar" ? raw.chainFamily : undefined,
    network: typeof raw.network === "string" ? raw.network : undefined,
  };

  return {
    ok: true,
    rule,
    issues: [],
    warnings,
  };
}

/**
 * Assert that a rule is valid, throwing RuleValidationError if validation fails.
 */
export function assertValidRule(payload: unknown, now = new Date()): CurrentRule {
  const res = validateRule(payload, now);
  if (!res.ok) {
    throw new RuleValidationError(res.error, res.issues);
  }
  return res.rule;
}

export const validateRulePayload = validateRule;
