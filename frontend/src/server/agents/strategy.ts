import type {
  AgentRecommendedAction,
  StrategyPolicyDecision,
  StrategyPolicyResult,
  UserRule,
} from "@/server/types";
import { getDefaultRules } from "@/server/rules/defaultRules";
import { getChainFamily } from "@/lib/chainIdentity";

// ---------------------------------------------------------------------------
// Context passed to the shared strategy enforcer by both decision
// and execution agents.
// ---------------------------------------------------------------------------
export type StrategyEnforcerContext = {
  /** The recommended action being evaluated */
  action: AgentRecommendedAction;
  /** Portfolio / token risk score (0-100) */
  riskScore: number;
  /** Trade size as percent of holding or portfolio */
  percent: number;
  /** Estimated USD value of the proposed trade */
  estimatedValueUsd?: number;
  /** Current onchain/agent-derived liquidity assessment */
  liquidityRiskScore?: number;
  /** Current portfolio exposure to this asset as percent */
  holdingAllocationPercent?: number;
  /** Current stablecoin reserve as percent of portfolio */
  stableReservePercent?: number;
  /** User-configured minimum stable reserve percent (from user rules/risk profile) */
  minStableReservePercent?: number;
  /** Target network / chain for the trade */
  network?: string;
  /** Source token symbol or address */
  fromToken?: string;
  /** Destination token symbol or address */
  toToken?: string;
  /** Slippage tolerance in basis points */
  slippageBps?: number;
  /** Whether the token is categorized as a meme coin */
  isMemeToken?: boolean;
  /** User-configured blocked token categories */
  blockedCategories?: string[];
  /** Simulation status */
  simulationStatus?: "not_required" | "pending" | "passed" | "failed" | "unavailable";
  // Stellar-specific fields
  stellarIssuer?: string;
  stellarIssuerClawback?: boolean;
  stellarIssuerRevocable?: boolean;
  stellarReserveRequiredXlm?: number;
  stellarCurrentXlmBalance?: number;
  stellarQuoteStatus?: "fresh" | "stale" | "unavailable" | "simulated";
  /** Whether we're in the decision (vs execution) phase */
  phase: "decision" | "execution";
  /** Decision confidence (only meaningful in decision phase) */
  confidence?: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalized(value?: string) {
  return value?.trim().toLowerCase();
}

function isStellarChain(chain?: string) {
  return getChainFamily(chain) === "stellar";
}

function makeDecision(
  ruleId: string,
  ruleVersion: number,
  ruleLabel: string,
  category: StrategyPolicyDecision["ruleCategory"],
  observedValue: number | string,
  threshold: number | string,
  violated: boolean,
  reason: string,
): StrategyPolicyDecision {
  return {
    ruleId: `${ruleId}:${category}`,
    ruleVersion,
    ruleLabel,
    ruleCategory: category,
    observedValue,
    threshold,
    violated,
    reason,
    action: violated ? "blocked" : "passed",
  };
}

function makeWarning(
  ruleId: string,
  ruleVersion: number,
  ruleLabel: string,
  category: StrategyPolicyDecision["ruleCategory"],
  observedValue: number | string,
  threshold: number | string,
  reason: string,
): StrategyPolicyDecision {
  return {
    ruleId: `${ruleId}:${category}`,
    ruleVersion,
    ruleLabel,
    ruleCategory: category,
    observedValue,
    threshold,
    violated: false,
    reason,
    action: "warned",
  };
}

// ---------------------------------------------------------------------------
// Core enforcer
// ---------------------------------------------------------------------------

/**
 * Evaluate a decision/execution context against the user's stored rules.
 * Returns structured policy decisions with rule IDs, observed values,
 * thresholds, and human-readable reasons.
 *
 * Used by both the Decision Agent and the Execution Agent so that every
 * pipeline stage sees the same versioned rule snapshot.
 */
export function evaluateStrategy(
  context: StrategyEnforcerContext,
  rules?: UserRule,
): StrategyPolicyResult {
  const safeRules = rules ?? getDefaultRules();
  const defaults = getDefaultRules(safeRules.walletAddress);
  const version = safeRules.version ?? 1;
  const walletAddress = safeRules.walletAddress;

  const maxRiskScore =
    safeRules.maxRiskScore ?? defaults.maxRiskScore;
  const maxTradePercent =
    safeRules.maxTradePercent ?? defaults.maxTradePercent;
  const maxMemeExposurePercent =
    safeRules.maxMemeExposurePercent ?? defaults.maxMemeExposurePercent;
  const maxDailyTransactionValueUsd =
    safeRules.maxDailyTransactionValueUsd ?? defaults.maxDailyTransactionValueUsd ?? 1_000;
  const maxSlippageBps =
    safeRules.maxSlippageBps ?? defaults.maxSlippageBps ?? 100;

  const allowedChains = (
    safeRules.allowedChains?.length
      ? safeRules.allowedChains
      : defaults.allowedChains ?? ["GOAT Network"]
  ).map((c) => c.trim()).filter(Boolean);

  const blockedTokens = (
    safeRules.blockedTokens ?? []
  ).map((t) => t.trim().toLowerCase()).filter(Boolean);

  const allowedActions = new Set<AgentRecommendedAction>(
    safeRules.allowedActions?.length
      ? safeRules.allowedActions
      : defaults.allowedActions ?? [
          "hold",
          "watch",
          "reduce_exposure",
          "swap_to_stable",
          "prepare_transaction",
          "no_action",
        ],
  );

  const autoExecute = safeRules.autoExecute;
  const decisions: StrategyPolicyDecision[] = [];

  const ruleId = `rule:${walletAddress}`;

  const tradeAction =
    context.action === "swap_to_stable" ||
    context.action === "reduce_exposure" ||
    context.action === "prepare_transaction";

  // ---- 1. Auto-execute guard ----
  if (autoExecute) {
    decisions.push(
      makeDecision(
        ruleId,
        version,
        "Auto-execute",
        "auto_execute",
        String(autoExecute),
        "false",
        true,
        "Auto-execute is disabled. User wallet approval is mandatory.",
      ),
    );
  }

  // ---- 2. Allowed action check ----
  if (!allowedActions.has(context.action)) {
    decisions.push(
      makeDecision(
        ruleId,
        version,
        "Allowed actions",
        "allowed_action",
        context.action,
        [...allowedActions].join(", "),
        true,
        `Action "${context.action}" is not allowed by user strategy.`,
      ),
    );
  }

  if (context.action === "avoid" || context.action === "manual_review") {
    decisions.push(
      makeDecision(
        ruleId,
        version,
        "Blocked action",
        "allowed_action",
        context.action,
        "execute",
        true,
        `Action "${context.action.replaceAll("_", " ")}" cannot prepare a transaction until the user reviews the risk.`,
      ),
    );
  }

  // ---- 3. Max risk score ----
  if (context.riskScore > maxRiskScore) {
    decisions.push(
      makeDecision(
        ruleId,
        version,
        "Max risk score",
        "risk_threshold",
        context.riskScore,
        maxRiskScore,
        true,
        `Risk score ${context.riskScore} exceeds max risk threshold ${maxRiskScore}.`,
      ),
    );
  } else if (maxRiskScore < 100) {
    decisions.push(
      makeDecision(
        ruleId,
        version,
        "Max risk score",
        "risk_threshold",
        context.riskScore,
        maxRiskScore,
        false,
        `Risk score ${context.riskScore} is within max risk threshold ${maxRiskScore}.`,
      ),
    );
  }

  // ---- 4. Max trade percent ----
  if (tradeAction && context.percent > maxTradePercent) {
    decisions.push(
      makeDecision(
        ruleId,
        version,
        "Max trade percent",
        "trade_size",
        context.percent,
        maxTradePercent,
        true,
        `Requested ${context.percent}% exceeds max trade percent ${maxTradePercent}%.`,
      ),
    );
  } else if (tradeAction) {
    decisions.push(
      makeDecision(
        ruleId,
        version,
        "Max trade percent",
        "trade_size",
        context.percent,
        maxTradePercent,
        false,
        `Trade size ${context.percent}% is within max ${maxTradePercent}%.`,
      ),
    );
  }

  // ---- 5. Max daily transaction value ----
  if (
    typeof context.estimatedValueUsd === "number" &&
    context.estimatedValueUsd > maxDailyTransactionValueUsd
  ) {
    decisions.push(
      makeDecision(
        ruleId,
        version,
        "Max daily transaction value",
        "daily_limit",
        Math.round(context.estimatedValueUsd),
        maxDailyTransactionValueUsd,
        true,
        `Estimated value $${Math.round(context.estimatedValueUsd).toLocaleString("en-US")} exceeds daily transaction value limit $${maxDailyTransactionValueUsd.toLocaleString("en-US")}.`,
      ),
    );
  } else if (
    typeof context.estimatedValueUsd === "number" &&
    tradeAction
  ) {
    decisions.push(
      makeDecision(
        ruleId,
        version,
        "Max daily transaction value",
        "daily_limit",
        Math.round(context.estimatedValueUsd),
        maxDailyTransactionValueUsd,
        false,
        `Estimated value $${Math.round(context.estimatedValueUsd).toLocaleString("en-US")} is within daily limit $${maxDailyTransactionValueUsd.toLocaleString("en-US")}.`,
      ),
    );
  }

  // ---- 6. Meme token exposure ----
  if (context.isMemeToken && typeof context.holdingAllocationPercent === "number" && context.holdingAllocationPercent > maxMemeExposurePercent) {
    decisions.push(
      makeDecision(
        ruleId,
        version,
        "Max meme exposure",
        "exposure",
        context.holdingAllocationPercent,
        maxMemeExposurePercent,
        true,
        `Meme token exposure ${context.holdingAllocationPercent.toFixed(1)}% exceeds max ${maxMemeExposurePercent}%.`,
      ),
    );
  }

  // ---- 7. Stable reserve check (decision phase only) ----
  if (
    context.phase === "decision" &&
    typeof context.stableReservePercent === "number" &&
    typeof context.holdingAllocationPercent === "number" &&
    context.holdingAllocationPercent >= 25 &&
    context.riskScore >= 50
  ) {
    const minStable = context.minStableReservePercent ?? 15;
    if (context.stableReservePercent < minStable) {
      decisions.push(
        makeDecision(
          ruleId,
          version,
          "Stable reserve ratio",
          "stable_reserve",
          context.stableReservePercent,
          minStable,
          true,
          `Stable reserve ${context.stableReservePercent.toFixed(1)}% is below configured minimum ${minStable}% for high-exposure positions.`,
        ),
      );
    }
  }

  // ---- 8. Liquidity risk check ----
  if (typeof context.liquidityRiskScore === "number" && context.liquidityRiskScore >= 75) {
    decisions.push(
      makeDecision(
        ruleId,
        version,
        "Liquidity risk",
        "liquidity",
        context.liquidityRiskScore,
        75,
        true,
        `Liquidity risk score ${context.liquidityRiskScore} is critical — trades may suffer severe slippage.`,
      ),
    );
  } else if (typeof context.liquidityRiskScore === "number" && context.liquidityRiskScore >= 50) {
    decisions.push(
      makeWarning(
        ruleId,
        version,
        "Liquidity risk",
        "liquidity",
        context.liquidityRiskScore,
        50,
        `Liquidity risk score ${context.liquidityRiskScore} is elevated.`,
      ),
    );
  }

  // ---- 9. Slippage check ----
  if (typeof context.slippageBps === "number" && context.slippageBps > maxSlippageBps) {
    decisions.push(
      makeDecision(
        ruleId,
        version,
        "Max slippage",
        "slippage",
        context.slippageBps,
        maxSlippageBps,
        true,
        `Slippage ${context.slippageBps} bps exceeds max slippage ${maxSlippageBps} bps.`,
      ),
    );
  }

  // ---- 10. Allowed chains ----
  if (context.network && allowedChains.length > 0 && !allowedChains.map(normalized).includes(normalized(context.network))) {
    decisions.push(
      makeDecision(
        ruleId,
        version,
        "Allowed chains",
        "allowed_chain",
        context.network ?? "unknown",
        allowedChains.join(", "),
        true,
        `Network "${context.network}" is not in allowed chains: ${allowedChains.join(", ")}.`,
      ),
    );
  }

  // ---- 11. Blocked tokens (chain-aware and issuer-aware) ----
  const blockedIssuers = (
    safeRules.blockedIssuers ?? []
  ).map((i) => i.trim().toLowerCase()).filter(Boolean);

  const chainAwareBlocked = new Set<string>();
  for (const entry of safeRules.blockedTokens ?? []) {
    const trimmed = entry.trim().toLowerCase();
    if (!trimmed) continue;
    // Register the entry as-is (bare token or chain-qualified: "chain:token")
    chainAwareBlocked.add(trimmed);
  }

  for (const token of [context.fromToken, context.toToken]) {
    const normalizedToken = normalized(token);
    if (!token || !normalizedToken) continue;

    const chainIdent = normalized(context.network) ? `${normalized(context.network)}:${normalizedToken}` : normalizedToken;
    // Block if the bare token OR the chain-qualified identity is in the set.
    // A bare entry "scam" blocks on all chains; "ethereum:scam" blocks only on Ethereum.
    const isBlocked = chainAwareBlocked.has(normalizedToken) || chainAwareBlocked.has(chainIdent);

    if (isBlocked) {
      decisions.push(
        makeDecision(
          ruleId,
          version,
          "Blocked tokens",
          "blocked_token",
          token,
          "blocked list",
          true,
          `Token "${token}"${context.network ? ` on ${context.network}` : ""} is blocked by user policy.`,
        ),
      );
    }
  }

  // ---- 11b. Blocked issuers (Stellar-specific) ----
  if (context.stellarIssuer && blockedIssuers.includes(normalized(context.stellarIssuer) ?? "")) {
    decisions.push(
      makeDecision(
        ruleId,
        version,
        "Blocked issuer",
        "stellar_issuer",
        context.stellarIssuer,
        "blocked issuer list",
        true,
        `Issuer ${context.stellarIssuer} is blocked by user policy.`,
      ),
    );
  }

  // ---- 11c. Blocked categories ----
  const blockedCategories = (context.blockedCategories ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean);
  if (blockedCategories.includes("meme") && context.isMemeToken) {
    decisions.push(
      makeDecision(
        ruleId,
        version,
        "Blocked category: meme",
        "blocked_category",
        "meme",
        "blocked category list",
        true,
        "Meme tokens are blocked by user policy.",
      ),
    );
  }

  // ---- 12. Simulation status ----
  if (context.simulationStatus === "failed") {
    decisions.push(
      makeDecision(
        ruleId,
        version,
        "Simulation",
        "trade_size",
        "failed",
        "passed",
        true,
        "Simulation failed. Confirmation is blocked until the issue is resolved.",
      ),
    );
  }

  // ---- 13. Stellar-specific checks ----
  if (isStellarChain(context.network)) {
    if (context.action === "create_trustline") {
      if (typeof context.stellarIssuer === "string") {
        if (context.stellarIssuerClawback === true) {
          decisions.push(
            makeDecision(
              ruleId,
              version,
              "Stellar clawback issuer",
              "stellar_trustline",
              context.stellarIssuer,
              "clawback blocked",
              true,
              `Issuer ${context.stellarIssuer} has clawback enabled, which is blocked by policy.`,
            ),
          );
        }
        if (context.stellarIssuerRevocable === true) {
          decisions.push(
            makeDecision(
              ruleId,
              version,
              "Stellar revocable issuer",
              "stellar_trustline",
              context.stellarIssuer,
              "revocable blocked",
              true,
              `Issuer ${context.stellarIssuer} has revocable authorization, which is blocked by policy.`,
            ),
          );
        }
      }

      if (typeof context.stellarReserveRequiredXlm === "number" && context.stellarReserveRequiredXlm > 5) {
        decisions.push(
          makeDecision(
            ruleId,
            version,
            "Stellar trustline reserve",
            "stellar_trustline",
            context.stellarReserveRequiredXlm,
            5,
            true,
            `Trustline reserve ${context.stellarReserveRequiredXlm} XLM exceeds max trustline reserve 5 XLM.`,
          ),
        );
      }
    }

    if (tradeAction) {
      if (context.stellarQuoteStatus === "unavailable") {
        decisions.push(
          makeDecision(
            ruleId,
            version,
            "Stellar swap quote",
            "stellar_trustline",
            "unavailable",
            "fresh",
            true,
            "Stellar swap requires a fresh quote before execution preparation.",
          ),
        );
      }
      if (context.stellarQuoteStatus === "stale") {
        decisions.push(
          makeDecision(
            ruleId,
            version,
            "Stellar swap quote",
            "stellar_trustline",
            "stale",
            "fresh",
            true,
            "The Stellar swap quote is stale. A fresh quote must be obtained.",
          ),
        );
      }
    }
  } else if (context.action === "create_trustline") {
    decisions.push(
      makeDecision(
        ruleId,
        version,
        "Trustline network",
        "stellar_trustline",
        context.network ?? "unknown",
        "stellar",
        true,
        "Trustline creation is only supported on Stellar networks.",
      ),
    );
  }

  // ---- Aggregate result ----
  const violations = decisions.filter((d) => d.violated);
  const warnings = decisions.filter((d) => d.action === "warned");
  const passed = decisions.filter((d) => !d.violated && d.action !== "warned");

  return {
    allowed: violations.filter((d) => d.action === "blocked").length === 0,
    violations,
    passed,
    warnings,
    ruleVersion: version,
    ruleWalletAddress: walletAddress,
    violationMessages: violations.map((d) => d.reason),
  };
}
