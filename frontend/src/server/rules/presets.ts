/**
 * Versioned strategy presets.
 *
 * Every default in this file is a product decision, so each one carries a
 * documented rationale. Maintainers own these numbers: changing a value is a
 * product change, and any change must bump `STRATEGY_PRESET_VERSION` so stored
 * profiles can be told apart from the preset they were created from.
 *
 * Presets never enable automatic execution. `autoExecute` is forced to `false`
 * everywhere in the rule pipeline; wallet approval stays mandatory.
 */

import type { AgentRecommendedAction } from "@/server/types";

/**
 * Bump whenever any preset value below changes.
 *
 * A stored profile records the version it was seeded from. When the stored
 * version is older than this constant the profile is still loaded verbatim —
 * user values are never silently rewritten — but the UI can surface that the
 * preset behind it has moved on.
 */
export const STRATEGY_PRESET_VERSION = 1;

export const STRATEGY_PROFILE_IDS = ["conservative", "balanced", "aggressive", "custom"] as const;

export type StrategyProfileId = (typeof STRATEGY_PROFILE_IDS)[number];

export type PresetProfileId = Exclude<StrategyProfileId, "custom">;

/** Category labels a user can block wholesale, independent of a single asset. */
export const BLOCKABLE_CATEGORIES = [
  "meme",
  "unaudited",
  "low_liquidity",
  "new_launch",
  "high_concentration",
  "rebasing",
  "algorithmic_stable",
  "privacy",
] as const;

export type BlockableCategory = (typeof BLOCKABLE_CATEGORIES)[number];

/**
 * The tunable limits that make up a strategy.
 *
 * Percent fields are whole percents (0-100). Value fields are USD. Basis-point
 * fields are 0-10000.
 */
export type StrategyLimits = {
  /** Highest Buy Risk score the user is willing to act on, 0-100. */
  maxBuyRisk: number;
  /** Largest share of portfolio value a single trade may move, 0-100. */
  maxTradePercent: number;
  /** Hard ceiling on a single trade in USD, independent of portfolio size. */
  maxTradeValueUsd: number;
  /** Ceiling on the total USD value of trades prepared in a rolling 24h window. */
  maxDailyValueUsd: number;
  /** Pools below this USD liquidity are not eligible for a prepared trade. */
  minLiquidityUsd: number;
  /** Largest share of portfolio value one token may represent, 0-100. */
  maxSingleTokenExposurePercent: number;
  /** Share of portfolio value that must stay in stables, 0-100. */
  minStableReservePercent: number;
  /** Largest share of portfolio value that may sit in meme assets, 0-100. */
  maxMemeExposurePercent: number;
  /** Slippage ceiling applied when a quote is requested, in basis points. */
  maxSlippageBps: number;
};

export type StrategyPreset = {
  id: PresetProfileId;
  label: string;
  /** One-line description shown next to the preset in the editor. */
  summary: string;
  limits: StrategyLimits;
  /** Chains a preset enables by default, as scan-network ids. */
  allowedChains: string[];
  blockedCategories: BlockableCategory[];
  allowedActions: AgentRecommendedAction[];
};

/**
 * Actions every preset permits. Preparing a transaction is included because a
 * prepared transaction still requires an explicit wallet signature — it is a
 * proposal, not an execution.
 */
const BASE_ALLOWED_ACTIONS: AgentRecommendedAction[] = [
  "hold",
  "watch",
  "reduce_exposure",
  "swap_to_stable",
  "prepare_transaction",
  "no_action",
];

/**
 * Default chain set shared by the presets.
 *
 * Limited to networks the scan pipeline has adapters for, and kept in step with
 * the chain list `getDefaultRules` shipped before presets existed so adopting a
 * preset does not silently narrow what an existing user could already scan.
 *
 * Allowing a chain here permits *analysis* on it. It is not deployment or
 * execution approval, which are gated separately.
 */
const DEFAULT_ALLOWED_CHAINS = [
  "stellar-testnet",
  "stellar-pubnet",
  "goat",
  "ethereum",
  "base",
  "arbitrum",
  "optimism",
  "polygon",
  "bsc",
];

export const STRATEGY_PRESETS: Record<PresetProfileId, StrategyPreset> = {
  conservative: {
    id: "conservative",
    label: "Conservative",
    summary: "Small positions, deep liquidity only, large stable reserve.",
    limits: {
      // Only act on assets the risk engine is fairly positive about.
      maxBuyRisk: 40,
      // A losing trade should not be able to move the portfolio much.
      maxTradePercent: 5,
      maxTradeValueUsd: 250,
      maxDailyValueUsd: 1_000,
      // Deep pools only, so exit is possible without heavy slippage.
      minLiquidityUsd: 250_000,
      maxSingleTokenExposurePercent: 10,
      // Half the portfolio stays in stables.
      minStableReservePercent: 50,
      maxMemeExposurePercent: 0,
      maxSlippageBps: 50,
    },
    allowedChains: [...DEFAULT_ALLOWED_CHAINS],
    blockedCategories: ["meme", "unaudited", "low_liquidity", "new_launch", "rebasing", "algorithmic_stable"],
    allowedActions: [...BASE_ALLOWED_ACTIONS],
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    summary: "Moderate sizing with a meaningful stable buffer.",
    limits: {
      maxBuyRisk: 60,
      maxTradePercent: 15,
      maxTradeValueUsd: 1_000,
      maxDailyValueUsd: 5_000,
      minLiquidityUsd: 100_000,
      maxSingleTokenExposurePercent: 25,
      minStableReservePercent: 25,
      maxMemeExposurePercent: 5,
      maxSlippageBps: 100,
    },
    allowedChains: [...DEFAULT_ALLOWED_CHAINS],
    blockedCategories: ["unaudited", "algorithmic_stable"],
    allowedActions: [...BASE_ALLOWED_ACTIONS],
  },
  aggressive: {
    id: "aggressive",
    label: "Aggressive",
    summary: "Larger positions and higher risk tolerance, thinner reserve.",
    limits: {
      maxBuyRisk: 80,
      maxTradePercent: 30,
      maxTradeValueUsd: 5_000,
      maxDailyValueUsd: 20_000,
      minLiquidityUsd: 25_000,
      maxSingleTokenExposurePercent: 40,
      minStableReservePercent: 10,
      maxMemeExposurePercent: 20,
      maxSlippageBps: 300,
    },
    allowedChains: [...DEFAULT_ALLOWED_CHAINS],
    blockedCategories: ["algorithmic_stable"],
    allowedActions: [...BASE_ALLOWED_ACTIONS],
  },
};

export function isPresetProfileId(value: unknown): value is PresetProfileId {
  return value === "conservative" || value === "balanced" || value === "aggressive";
}

export function isStrategyProfileId(value: unknown): value is StrategyProfileId {
  return STRATEGY_PROFILE_IDS.includes(value as StrategyProfileId);
}

export function getStrategyPreset(id: PresetProfileId): StrategyPreset {
  return STRATEGY_PRESETS[id];
}

/** Ordered list used to render the preset picker. */
export function listStrategyPresets(): StrategyPreset[] {
  return [STRATEGY_PRESETS.conservative, STRATEGY_PRESETS.balanced, STRATEGY_PRESETS.aggressive];
}

/**
 * Returns the limit keys where `limits` departs from the named preset.
 *
 * Used to decide whether a profile is still faithfully "Balanced" or has become
 * "Custom", and to tell the user exactly which values they changed.
 */
export function diffFromPreset(id: PresetProfileId, limits: StrategyLimits): (keyof StrategyLimits)[] {
  const preset = STRATEGY_PRESETS[id].limits;

  return (Object.keys(preset) as (keyof StrategyLimits)[]).filter((key) => preset[key] !== limits[key]);
}
