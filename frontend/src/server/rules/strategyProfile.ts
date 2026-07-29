/**
 * Strategy profile normalization and validation.
 *
 * This module is the single place where a profile is turned from untrusted
 * input into a stored `UserRule`. Both the API route and the storage adapter go
 * through it, so a value that reaches the database has always been range
 * checked and canonicalized.
 */

import { z } from "zod";
import type { AgentRecommendedAction, UserRule } from "@/server/types";
import { scanNetworks } from "@/lib/scanNetworks";
import {
  BLOCKABLE_CATEGORIES,
  STRATEGY_PRESET_VERSION,
  STRATEGY_PRESETS,
  diffFromPreset,
  isPresetProfileId,
  type PresetProfileId,
  type StrategyLimits,
  type StrategyProfileId,
} from "./presets";
import { parseBlockedAssetList } from "./assetKeys";

const ALLOWED_ACTIONS = [
  "hold",
  "watch",
  "reduce_exposure",
  "swap_to_stable",
  "avoid",
  "manual_review",
  "prepare_transaction",
  "no_action",
] as const satisfies readonly AgentRecommendedAction[];

const knownChainIds = new Set(scanNetworks.map((network) => network.id));

/**
 * Labels that older stored rows used but that no longer appear in
 * `scanNetworks` under that spelling.
 *
 * Without these, migrating a pre-strategy profile would silently drop chains
 * the user had explicitly allowed — the worst possible failure mode, because it
 * narrows a policy without telling anyone.
 */
const LEGACY_CHAIN_ALIASES: Record<string, string> = {
  "goat network": "goat",
};

/**
 * Resolve a chain id, display name or alias to a canonical scan-network id.
 *
 * Legacy rows stored display names ("GOAT Network", "BSC"), so accepting them
 * keeps an existing profile's chain list intact through migration instead of
 * silently emptying it.
 */
export function resolveChainId(value: string): string | null {
  const normalized = value.trim().toLowerCase();

  if (knownChainIds.has(normalized)) {
    return normalized;
  }

  if (LEGACY_CHAIN_ALIASES[normalized]) {
    return LEGACY_CHAIN_ALIASES[normalized];
  }

  const match = scanNetworks.find(
    (network) =>
      network.name.toLowerCase() === normalized ||
      (network.aliases ?? []).some((alias) => alias.toLowerCase() === normalized),
  );

  return match?.id ?? null;
}

/** Chains a profile may allow, as scan-network ids. */
export function listSelectableChains() {
  return scanNetworks.map((network) => ({
    id: network.id,
    name: network.name,
    chainFamily: network.chainFamily ?? "evm",
  }));
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

const percent = z.number().finite().min(0).max(100);
const usd = z.number().finite().min(0).max(1_000_000_000);

/**
 * Wire schema for a submitted profile.
 *
 * Every numeric bound is enforced here rather than in the UI, so a direct API
 * call cannot store an out-of-range value.
 */
export const strategyProfileInputSchema = z.object({
  walletAddress: z.string().trim().min(1, "walletAddress is required"),
  profileId: z.enum(["conservative", "balanced", "aggressive", "custom"]),
  presetVersion: z.number().int().min(1).optional(),
  maxBuyRisk: percent,
  maxTradePercent: percent,
  maxTradeValueUsd: usd,
  maxDailyValueUsd: usd,
  minLiquidityUsd: usd,
  maxSingleTokenExposurePercent: percent,
  minStableReservePercent: percent,
  maxMemeExposurePercent: percent,
  maxSlippageBps: z.number().int().min(0).max(10_000),
  allowedChains: z.array(z.string().trim().min(1)).max(64),
  blockedAssets: z.array(z.string().trim().min(1)).max(500).optional(),
  blockedCategories: z.array(z.string().trim().min(1)).max(64).optional(),
  allowedActions: z.array(z.enum(ALLOWED_ACTIONS)).max(ALLOWED_ACTIONS.length).optional(),
  createdAt: z.string().optional(),
});

export type StrategyProfileInput = z.infer<typeof strategyProfileInputSchema>;

export type ProfileValidationIssue = {
  /** Dotted field path, e.g. `blockedAssets[2]`. */
  field: string;
  message: string;
};

export type ProfileValidationResult =
  | { ok: true; rule: UserRule; warnings: ProfileValidationIssue[] }
  | { ok: false; issues: ProfileValidationIssue[] };

function limitsFrom(input: StrategyProfileInput): StrategyLimits {
  return {
    maxBuyRisk: input.maxBuyRisk,
    maxTradePercent: input.maxTradePercent,
    maxTradeValueUsd: input.maxTradeValueUsd,
    maxDailyValueUsd: input.maxDailyValueUsd,
    minLiquidityUsd: input.minLiquidityUsd,
    maxSingleTokenExposurePercent: input.maxSingleTokenExposurePercent,
    minStableReservePercent: input.minStableReservePercent,
    maxMemeExposurePercent: input.maxMemeExposurePercent,
    maxSlippageBps: input.maxSlippageBps,
  };
}

/**
 * Build the rule a preset seeds, without touching storage.
 *
 * Used both to render a freshly picked preset and to give a wallet with no
 * stored profile a starting point.
 */
export function buildProfileFromPreset(walletAddress: string, id: PresetProfileId, now = new Date()): UserRule {
  const preset = STRATEGY_PRESETS[id];
  const timestamp = now.toISOString();

  return finalizeRule({
    walletAddress,
    profileId: id,
    presetVersion: STRATEGY_PRESET_VERSION,
    ...preset.limits,
    allowedChains: [...preset.allowedChains],
    blockedAssets: [],
    blockedCategories: [...preset.blockedCategories],
    allowedActions: [...preset.allowedActions],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

type FinalizeInput = Omit<UserRule, "maxRiskScore" | "maxDailyTransactionValueUsd" | "blockedTokens" | "autoExecute"> & {
  autoExecute?: boolean;
};

/**
 * Apply the invariants every stored rule must satisfy: legacy mirrors are
 * recomputed from the canonical fields, and automatic execution stays off.
 */
export function finalizeRule(input: FinalizeInput): UserRule {
  return {
    ...input,
    maxRiskScore: input.maxBuyRisk,
    maxDailyTransactionValueUsd: input.maxDailyValueUsd,
    blockedTokens: [...input.blockedAssets],
    // Wallet approval is mandatory. There is no code path that stores `true`.
    autoExecute: false,
  };
}

/**
 * Resolve the profile id a set of limits actually represents.
 *
 * A user who picks "Balanced" and then edits one slider is running a custom
 * strategy, and the editor must say so rather than keep claiming a preset the
 * numbers no longer match. Conversely, editing values back to exactly match a
 * preset re-adopts that preset's label.
 */
export function resolveProfileId(requested: StrategyProfileId, limits: StrategyLimits): StrategyProfileId {
  // The requested id is a hint about intent, not an assertion about the values.
  // What the profile *is* follows from the limits alone: if they match a preset
  // exactly it is that preset, whatever the caller claimed, and otherwise it is
  // custom. Checking the requested preset first means a user who edits their
  // way from Aggressive to exactly Conservative gets the accurate label.
  const matching = (["conservative", "balanced", "aggressive"] as const).find(
    (id) => diffFromPreset(id, limits).length === 0,
  );

  if (matching) {
    return matching;
  }

  return isPresetProfileId(requested) ? "custom" : requested;
}

/**
 * Validate and canonicalize a submitted profile.
 *
 * Returns every problem found rather than the first, so the editor can mark all
 * offending fields in one pass.
 */
export function validateStrategyProfile(payload: unknown, now = new Date()): ProfileValidationResult {
  const parsed = strategyProfileInputSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "(root)",
        message: issue.message,
      })),
    };
  }

  const input = parsed.data;
  const issues: ProfileValidationIssue[] = [];
  const warnings: ProfileValidationIssue[] = [];

  // Chains: unknown ids are rejected outright rather than dropped, so a typo
  // cannot silently widen or narrow what the user believes they allowed.
  const allowedChains: string[] = [];

  for (const [index, chain] of input.allowedChains.entries()) {
    const resolved = resolveChainId(chain);

    if (!resolved) {
      issues.push({ field: `allowedChains[${index}]`, message: `Unknown chain "${chain}"` });
      continue;
    }

    if (!allowedChains.includes(resolved)) {
      allowedChains.push(resolved);
    }
  }

  if (allowedChains.length === 0 && issues.length === 0) {
    issues.push({ field: "allowedChains", message: "At least one chain must be allowed" });
  }

  // Blocked assets: canonicalized, with every bad row reported.
  const blocked = parseBlockedAssetList(input.blockedAssets ?? []);

  for (const error of blocked.errors) {
    issues.push({ field: "blockedAssets", message: `${error.input}: ${error.message}` });
  }

  // Categories.
  const blockedCategories: string[] = [];

  for (const [index, category] of (input.blockedCategories ?? []).entries()) {
    const normalized = category.trim().toLowerCase();

    if (!BLOCKABLE_CATEGORIES.includes(normalized as (typeof BLOCKABLE_CATEGORIES)[number])) {
      issues.push({ field: `blockedCategories[${index}]`, message: `Unknown category "${category}"` });
      continue;
    }

    if (!blockedCategories.includes(normalized)) {
      blockedCategories.push(normalized);
    }
  }

  // Cross-field coherence. A stable reserve of 90% with a 30% max trade is not
  // contradictory on its own, but a reserve that leaves no room for the trade
  // the user also authorized is, and silently keeping both would mean one of
  // them never applies.
  if (input.minStableReservePercent + input.maxTradePercent > 100) {
    issues.push({
      field: "minStableReservePercent",
      message: "Minimum stable reserve plus max trade percent cannot exceed 100%",
    });
  }

  if (input.maxMemeExposurePercent > input.maxSingleTokenExposurePercent) {
    warnings.push({
      field: "maxMemeExposurePercent",
      message: "Meme exposure cap is above the single-token cap, so the single-token cap binds first",
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const limits = limitsFrom(input);
  const timestamp = now.toISOString();

  return {
    ok: true,
    warnings,
    rule: finalizeRule({
      walletAddress: input.walletAddress.trim(),
      profileId: resolveProfileId(input.profileId, limits),
      presetVersion: input.presetVersion ?? STRATEGY_PRESET_VERSION,
      ...limits,
      allowedChains,
      blockedAssets: blocked.keys,
      blockedCategories,
      allowedActions: input.allowedActions ?? [...STRATEGY_PRESETS.balanced.allowedActions],
      createdAt: input.createdAt ?? timestamp,
      updatedAt: timestamp,
    }),
  };
}

/**
 * Migrate a record that predates the strategy fields.
 *
 * Older rows only carried `maxRiskScore`, `maxTradePercent`,
 * `maxMemeExposurePercent` and a flat `blockedTokens` list. Their explicit
 * values are preserved; anything absent is filled from the Balanced preset so
 * the profile is complete without inventing a stricter or looser stance than
 * the user chose.
 */
export function migrateLegacyRule(record: Partial<UserRule> & { walletAddress: string }, now = new Date()): UserRule {
  const fallback = STRATEGY_PRESETS.balanced.limits;
  const timestamp = now.toISOString();
  const maxBuyRisk = record.maxBuyRisk ?? record.maxRiskScore ?? fallback.maxBuyRisk;
  const legacyBlocked = record.blockedAssets ?? record.blockedTokens ?? [];

  const limits: StrategyLimits = {
    maxBuyRisk,
    maxTradePercent: record.maxTradePercent ?? fallback.maxTradePercent,
    maxTradeValueUsd: record.maxTradeValueUsd ?? fallback.maxTradeValueUsd,
    maxDailyValueUsd: record.maxDailyValueUsd ?? record.maxDailyTransactionValueUsd ?? fallback.maxDailyValueUsd,
    minLiquidityUsd: record.minLiquidityUsd ?? fallback.minLiquidityUsd,
    maxSingleTokenExposurePercent:
      record.maxSingleTokenExposurePercent ?? fallback.maxSingleTokenExposurePercent,
    minStableReservePercent: record.minStableReservePercent ?? fallback.minStableReservePercent,
    maxMemeExposurePercent: record.maxMemeExposurePercent ?? fallback.maxMemeExposurePercent,
    maxSlippageBps: record.maxSlippageBps ?? fallback.maxSlippageBps,
  };

  // Legacy blocked entries that predate canonical keys are kept only if they
  // still parse; an unparseable legacy row is dropped rather than stored in a
  // form nothing can match against.
  const blocked = parseBlockedAssetList(legacyBlocked);

  return finalizeRule({
    walletAddress: record.walletAddress,
    profileId: resolveProfileId(record.profileId ?? "custom", limits),
    presetVersion: record.presetVersion ?? STRATEGY_PRESET_VERSION,
    ...limits,
    allowedChains: dedupe(
      (record.allowedChains ?? STRATEGY_PRESETS.balanced.allowedChains)
        .map(resolveChainId)
        .filter((chain): chain is string => chain !== null),
    ),
    blockedAssets: blocked.keys,
    blockedCategories: record.blockedCategories ?? [...STRATEGY_PRESETS.balanced.blockedCategories],
    allowedActions: record.allowedActions ?? [...STRATEGY_PRESETS.balanced.allowedActions],
    createdAt: record.createdAt ?? timestamp,
    updatedAt: record.updatedAt ?? timestamp,
  });
}
