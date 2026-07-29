import { describe, it, expect } from "vitest";
import { evaluateStrategy, type StrategyEnforcerContext } from "../strategy";
import type { UserRule } from "@/server/types";
import { getDefaultRules } from "@/server/rules/defaultRules";

function defaultRules(overrides: Partial<UserRule> = {}): UserRule {
  return { ...getDefaultRules("0xTestWallet"), ...overrides, autoExecute: false };
}

function baseContext(overrides: Partial<StrategyEnforcerContext> = {}): StrategyEnforcerContext {
  return {
    action: "prepare_transaction",
    riskScore: 45,
    percent: 15,
    estimatedValueUsd: 500,
    network: "Base",
    phase: "execution",
    ...overrides,
  };
}

describe("evaluateStrategy", () => {
  // ---------------------------------------------------------------------------
  // Max risk score
  // ---------------------------------------------------------------------------
  it("blocks when risk score exceeds max", () => {
    const rules = defaultRules({ maxRiskScore: 50 });
    const result = evaluateStrategy(baseContext({ riskScore: 72 }), rules);
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.ruleCategory === "risk_threshold")).toBe(true);
  });

  it("passes when risk score is within max", () => {
    const rules = defaultRules({ maxRiskScore: 80 });
    const result = evaluateStrategy(baseContext({ riskScore: 45 }), rules);
    expect(result.allowed).toBe(true);
    expect(result.violations.some((v) => v.ruleCategory === "risk_threshold")).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Max trade percent
  // ---------------------------------------------------------------------------
  it("blocks when trade percent exceeds max", () => {
    const rules = defaultRules({ maxTradePercent: 10 });
    const result = evaluateStrategy(baseContext({ percent: 25, action: "swap_to_stable" }), rules);
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.ruleCategory === "trade_size")).toBe(true);
  });

  it("passes when trade percent is within max", () => {
    const rules = defaultRules({ maxTradePercent: 30 });
    const result = evaluateStrategy(baseContext({ percent: 15, action: "swap_to_stable" }), rules);
    expect(result.allowed).toBe(true);
  });

  it("does not check trade percent for non-trade actions", () => {
    const rules = defaultRules({ maxTradePercent: 5 });
    const result = evaluateStrategy(baseContext({ action: "hold", percent: 100 }), rules);
    expect(result.violations.some((v) => v.ruleCategory === "trade_size")).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Daily value limit
  // ---------------------------------------------------------------------------
  it("blocks when estimated value exceeds daily limit", () => {
    const rules = defaultRules({ maxDailyTransactionValueUsd: 1000 });
    const result = evaluateStrategy(baseContext({ estimatedValueUsd: 5000 }), rules);
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.ruleCategory === "daily_limit")).toBe(true);
  });

  it("passes when estimated value is within daily limit", () => {
    const rules = defaultRules({ maxDailyTransactionValueUsd: 5000 });
    const result = evaluateStrategy(baseContext({ estimatedValueUsd: 500 }), rules);
    expect(result.allowed).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Meme exposure
  // ---------------------------------------------------------------------------
  it("blocks when meme exposure exceeds max", () => {
    const rules = defaultRules({ maxMemeExposurePercent: 10 });
    const result = evaluateStrategy(
      baseContext({ isMemeToken: true, holdingAllocationPercent: 30 }),
      rules,
    );
    expect(result.violations.some((v) => v.ruleCategory === "exposure")).toBe(true);
  });

  it("ignores exposure check when not a meme token", () => {
    const rules = defaultRules({ maxMemeExposurePercent: 10 });
    const result = evaluateStrategy(
      baseContext({ isMemeToken: false, holdingAllocationPercent: 30 }),
      rules,
    );
    expect(result.violations.some((v) => v.ruleCategory === "exposure")).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Stable reserve
  // ---------------------------------------------------------------------------
  it("warns about low stable reserve in decision phase", () => {
    const rules = defaultRules();
    const result = evaluateStrategy(
      baseContext({
        phase: "decision",
        holdingAllocationPercent: 35,
        stableReservePercent: 5,
        riskScore: 60,
      }),
      rules,
    );
    expect(result.violations.some((v) => v.ruleCategory === "stable_reserve")).toBe(true);
  });

  it("skips stable reserve check in execution phase", () => {
    const rules = defaultRules();
    const result = evaluateStrategy(
      baseContext({
        phase: "execution",
        holdingAllocationPercent: 35,
        stableReservePercent: 5,
        riskScore: 60,
      }),
      rules,
    );
    expect(result.violations.some((v) => v.ruleCategory === "stable_reserve")).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Allowed chains
  // ---------------------------------------------------------------------------
  it("blocks disallowed chain", () => {
    const rules = defaultRules({ allowedChains: ["Ethereum", "Base"] });
    const result = evaluateStrategy(baseContext({ network: "Solana" }), rules);
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.ruleCategory === "allowed_chain")).toBe(true);
  });

  it("passes allowed chain", () => {
    const rules = defaultRules({ allowedChains: ["Ethereum", "Base"] });
    const result = evaluateStrategy(baseContext({ network: "Base" }), rules);
    expect(result.allowed).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Blocked tokens
  // ---------------------------------------------------------------------------
  it("blocks forbidden token", () => {
    const rules = defaultRules({ blockedTokens: ["SCAM"] });
    const result = evaluateStrategy(baseContext({ fromToken: "SCAM" }), rules);
    expect(result.violations.some((v) => v.ruleCategory === "blocked_token")).toBe(true);
  });

  it("passes unblocked token", () => {
    const rules = defaultRules({ blockedTokens: ["SCAM"] });
    const result = evaluateStrategy(baseContext({ fromToken: "USDC" }), rules);
    expect(result.allowed).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Slippage
  // ---------------------------------------------------------------------------
  it("blocks excessive slippage", () => {
    const rules = defaultRules({ maxSlippageBps: 100 });
    const result = evaluateStrategy(baseContext({ slippageBps: 500 }), rules);
    expect(result.violations.some((v) => v.ruleCategory === "slippage")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Allowed actions
  // ---------------------------------------------------------------------------
  it("blocks disallowed action", () => {
    const rules = defaultRules({ allowedActions: ["hold", "watch"] });
    const result = evaluateStrategy(baseContext({ action: "swap_to_stable" }), rules);
    expect(result.violations.some((v) => v.ruleCategory === "allowed_action")).toBe(true);
  });

  it("blocks avoid/manual_review actions", () => {
    const rules = defaultRules();
    const result = evaluateStrategy(baseContext({ action: "avoid" }), rules);
    expect(result.violations.some((v) => v.ruleCategory === "allowed_action")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------
  it("blocks when simulation failed", () => {
    const rules = defaultRules();
    const result = evaluateStrategy(baseContext({ simulationStatus: "failed" }), rules);
    expect(result.violations.some((v) => v.ruleLabel === "Simulation")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Stellar trustline checks
  // ---------------------------------------------------------------------------
  it("blocks trustline with clawback issuer", () => {
    const rules = defaultRules();
    const result = evaluateStrategy(
      baseContext({
        action: "create_trustline",
        network: "Stellar Testnet",
        stellarIssuer: "GABC...",
        stellarIssuerClawback: true,
      }),
      rules,
    );
    expect(result.violations.some((v) => v.ruleLabel === "Stellar clawback issuer")).toBe(true);
  });

  it("blocks trustline with revocable issuer", () => {
    const rules = defaultRules();
    const result = evaluateStrategy(
      baseContext({
        action: "create_trustline",
        network: "Stellar Testnet",
        stellarIssuer: "GABC...",
        stellarIssuerRevocable: true,
      }),
      rules,
    );
    expect(result.violations.some((v) => v.ruleLabel === "Stellar revocable issuer")).toBe(true);
  });

  it("blocks trustline on non-Stellar network", () => {
    const rules = defaultRules();
    const result = evaluateStrategy(
      baseContext({ action: "create_trustline", network: "Base" }),
      rules,
    );
    expect(result.violations.some((v) => v.ruleLabel === "Trustline network")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Auto-execute guard
  // ---------------------------------------------------------------------------
  it("blocks when auto-execute is enabled (always forced false)", () => {
    const rules = defaultRules({ autoExecute: true });
    const result = evaluateStrategy(baseContext(), rules);
    expect(result.violations.some((v) => v.ruleCategory === "auto_execute")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Structured output
  // ---------------------------------------------------------------------------
  it("returns structured policy decisions with rule metadata", () => {
    const rules = defaultRules({ maxRiskScore: 50, version: 3, walletAddress: "0xTest" });
    const result = evaluateStrategy(baseContext({ riskScore: 72 }), rules);

    expect(result.ruleVersion).toBe(3);
    expect(result.ruleWalletAddress).toBe("0xTest");
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.passed.length).toBeGreaterThan(0);

    for (const decision of [...result.violations, ...result.passed, ...result.warnings]) {
      expect(decision.ruleId).toContain("rule:0xTest:");
      expect(decision.ruleVersion).toBe(3);
      expect(decision.ruleLabel).toBeTruthy();
      expect(decision.ruleCategory).toBeTruthy();
      expect(decision.reason).toBeTruthy();
      expect(["blocked", "warned", "passed"]).toContain(decision.action);
    }
  });

  // ---------------------------------------------------------------------------
  // Chain-aware token blocking
  // ---------------------------------------------------------------------------
  it("blocks token on specific chain when chain-qualified blocked token is set", () => {
    const rules = defaultRules({ blockedTokens: ["ethereum:SCAM"] });
    const result = evaluateStrategy(
      baseContext({ fromToken: "SCAM", network: "Ethereum" }),
      rules,
    );
    expect(result.violations.some((v) => v.ruleCategory === "blocked_token")).toBe(true);
  });

  it("allows same token symbol on a different chain when chain-qualified", () => {
    const rules = defaultRules({ blockedTokens: ["ethereum:SCAM"] });
    const result = evaluateStrategy(
      baseContext({ fromToken: "SCAM", network: "Base" }),
      rules,
    );
    // The bare token "scam" is not blocked; only "ethereum:scam" is
    expect(result.violations.some((v) => v.ruleCategory === "blocked_token")).toBe(false);
  });

  it("blocks bare token regardless of chain", () => {
    const rules = defaultRules({ blockedTokens: ["SCAM"] });
    const result = evaluateStrategy(
      baseContext({ fromToken: "SCAM", network: "Solana" }),
      rules,
    );
    expect(result.violations.some((v) => v.ruleCategory === "blocked_token")).toBe(true);
  });

  it("blocks token when chain+symbol identity matches", () => {
    const rules = defaultRules({ blockedTokens: ["solana:fraud"] });
    const result = evaluateStrategy(
      baseContext({ fromToken: "FRAUD", network: "Solana" }),
      rules,
    );
    expect(result.violations.some((v) => v.ruleCategory === "blocked_token")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Issuer-specific blocking (Stellar)
  // ---------------------------------------------------------------------------
  it("blocks Stellar issuer when issuer is in blocked list", () => {
    const rules = defaultRules({ blockedIssuers: ["GSCAM..."] });
    const result = evaluateStrategy(
      baseContext({
        network: "Stellar Testnet",
        stellarIssuer: "GSCAM...",
        action: "create_trustline",
      }),
      rules,
    );
    expect(result.violations.some((v) => v.ruleCategory === "stellar_issuer")).toBe(true);
  });

  it("passes Stellar issuer not in blocked list", () => {
    const rules = defaultRules({ blockedIssuers: ["GSCAM..."] });
    const result = evaluateStrategy(
      baseContext({
        network: "Stellar Testnet",
        stellarIssuer: "GOKAY...",
        action: "create_trustline",
      }),
      rules,
    );
    expect(result.violations.some((v) => v.ruleCategory === "stellar_issuer")).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Blocked categories
  // ---------------------------------------------------------------------------
  it("blocks meme token when category is blocked", () => {
    const rules = defaultRules();
    const result = evaluateStrategy(
      baseContext({ isMemeToken: true, blockedCategories: ["meme"] }),
      rules,
    );
    expect(result.violations.some((v) => v.ruleCategory === "blocked_category")).toBe(true);
  });

  it("passes non-meme token when category is blocked", () => {
    const rules = defaultRules();
    const result = evaluateStrategy(
      baseContext({ isMemeToken: false, blockedCategories: ["meme"] }),
      rules,
    );
    expect(result.violations.some((v) => v.ruleCategory === "blocked_category")).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Configurable stable reserve threshold
  // ---------------------------------------------------------------------------
  it("uses configured minStableReservePercent instead of hardcoded default", () => {
    const rules = defaultRules({ minStableReservePercent: 25 });
    const result = evaluateStrategy(
      baseContext({
        phase: "decision",
        holdingAllocationPercent: 35,
        stableReservePercent: 20,
        riskScore: 60,
        minStableReservePercent: 25,
      }),
      rules,
    );
    // 20% is below configured 25%, so should violate
    expect(result.violations.some((v) => v.ruleCategory === "stable_reserve")).toBe(true);
  });

  it("passes stable reserve when above configured threshold", () => {
    const rules = defaultRules({ minStableReservePercent: 10 });
    const result = evaluateStrategy(
      baseContext({
        phase: "decision",
        holdingAllocationPercent: 35,
        stableReservePercent: 15,
        riskScore: 60,
        minStableReservePercent: 10,
      }),
      rules,
    );
    // 15% is above configured 10%, so should pass
    expect(result.violations.some((v) => v.ruleCategory === "stable_reserve")).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Precedence: multiple violations
  // ---------------------------------------------------------------------------
  it("reports all violations when multiple rules are broken simultaneously", () => {
    const rules = defaultRules({
      maxRiskScore: 40,
      maxTradePercent: 5,
      blockedTokens: ["SCAM"],
      allowedChains: ["Ethereum"],
    });
    const result = evaluateStrategy(
      baseContext({
        riskScore: 72,
        percent: 30,
        action: "swap_to_stable",
        fromToken: "SCAM",
        network: "Solana",
        estimatedValueUsd: 5000,
        slippageBps: 500,
      }),
      rules,
    );

    expect(result.allowed).toBe(false);
    // Should have violations for risk, trade, daily, blocked token, chain, slippage
    expect(result.violations.length).toBeGreaterThanOrEqual(5);
    const categories = result.violations.map((v) => v.ruleCategory);
    expect(categories).toContain("risk_threshold");
    expect(categories).toContain("trade_size");
    expect(categories).toContain("blocked_token");
    expect(categories).toContain("allowed_chain");
  });

  // ---------------------------------------------------------------------------
  // Default rules fallback
  // ---------------------------------------------------------------------------
  it("uses default rules when no rules provided", () => {
    const result = evaluateStrategy(baseContext({ riskScore: 45, network: "Base" }));
    expect(result.allowed).toBe(true);
    expect(result.ruleVersion).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // Confidence does not bypass safety
  // ---------------------------------------------------------------------------
  it("low confidence context still has rules enforced", () => {
    const rules = defaultRules({ blockedTokens: ["SCAM"] });
    const result = evaluateStrategy(
      baseContext({ fromToken: "SCAM", confidence: 0.1 }),
      rules,
    );
    expect(result.violations.some((v) => v.ruleCategory === "blocked_token")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Critical-blocker precedence over strategy rules
  // ---------------------------------------------------------------------------
  it("reports critical-blocker violations alongside strategy violations without suppressing", () => {
    // When a critical blocker (e.g., simulation failure) and strategy violation
    // (e.g., blocked token) both exist, BOTH must be reported — the strategy
    // enforcer does not suppress any violation.
    const rules = defaultRules({
      maxRiskScore: 70,
      blockedTokens: ["DANGER"],
    });
    const result = evaluateStrategy(
      baseContext({
        riskScore: 85,
        fromToken: "DANGER",
        simulationStatus: "failed",
      }),
      rules,
    );

    expect(result.allowed).toBe(false);
    const categories = result.violations.map((v) => v.ruleCategory);
    expect(categories).toContain("risk_threshold");
    expect(categories).toContain("blocked_token");
    // Simulation failure is a separate violation
    expect(result.violations.some((v) => v.ruleLabel === "Simulation")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Versioned snapshot identity
  // ---------------------------------------------------------------------------
  it("carries rule version and wallet for snapshot traceability", () => {
    const rules = defaultRules({ version: 7, walletAddress: "0xSnapshot" });
    const result = evaluateStrategy(baseContext(), rules);

    expect(result.ruleVersion).toBe(7);
    expect(result.ruleWalletAddress).toBe("0xSnapshot");
    // All decisions should reference the same versioned snapshot
    for (const decision of [...result.violations, ...result.passed, ...result.warnings]) {
      expect(decision.ruleVersion).toBe(7);
    }
  });

  // ---------------------------------------------------------------------------
  // Decision-to-Execution snapshot propagation (contract test)
  // ---------------------------------------------------------------------------
  it("enforces the same rule snapshot for decision and execution phases", () => {
    const rules = defaultRules({
      version: 5,
      maxRiskScore: 60,
      walletAddress: "0xShared",
    });

    const decisionCtx = baseContext({
      phase: "decision",
      riskScore: 72,
      confidence: 0.5,
    });
    const executionCtx = baseContext({
      phase: "execution",
      riskScore: 72,
      action: "swap_to_stable",
      percent: 15,
    });

    const decisionResult = evaluateStrategy(decisionCtx, rules);
    const executionResult = evaluateStrategy(executionCtx, rules);

    // Both phases must see the same versioned snapshot
    expect(decisionResult.ruleVersion).toBe(5);
    expect(executionResult.ruleVersion).toBe(5);
    expect(decisionResult.ruleWalletAddress).toBe("0xShared");
    expect(executionResult.ruleWalletAddress).toBe("0xShared");

    // The same risk threshold violation should be detected in both phases
    expect(decisionResult.violations.some((v) => v.ruleCategory === "risk_threshold")).toBe(true);
    expect(executionResult.violations.some((v) => v.ruleCategory === "risk_threshold")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Version auto-increment behavior
  // ---------------------------------------------------------------------------
  it("uses the version from the provided rule snapshot", () => {
    // When a rule is passed with an explicit version, the enforcer must use that
    // version, not the default (1). This verifies that versioned snapshots are
    // propagated correctly.
    const rules = defaultRules({ version: 12, walletAddress: "0xVersioned" });
    const result = evaluateStrategy(baseContext(), rules);

    expect(result.ruleVersion).toBe(12);
  });

  it("falls back to default version 1 when no rules provided", () => {
    const result = evaluateStrategy(baseContext());
    expect(result.ruleVersion).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // Action downgrade on strategy violation (Decision integration contract)
  // ---------------------------------------------------------------------------
  it("strategy violation should be detectable by decision agent to downgrade action", () => {
    // This test verifies that the enforcer correctly reports violations so the
    // Decision Agent can downgrade the recommendedAction. The actual downgrade
    // logic lives in the Decision Agent; this test validates the contract.
    const rules = defaultRules({
      allowedActions: ["hold", "watch"],
      maxRiskScore: 30,
    });
    const result = evaluateStrategy(
      baseContext({ action: "swap_to_stable", riskScore: 72 }),
      rules,
    );

    // The enforcer must report at least one blocked violation
    expect(result.allowed).toBe(false);
    const blockedViolations = result.violations.filter((v) => v.action === "blocked");
    expect(blockedViolations.length).toBeGreaterThan(0);
    // At least one violation should be an allowed_action violation
    expect(blockedViolations.some((v) => v.ruleCategory === "allowed_action")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Liquidity and network context checks
  // ---------------------------------------------------------------------------
  it("blocks when liquidity risk is critical", () => {
    const rules = defaultRules();
    const result = evaluateStrategy(
      baseContext({ liquidityRiskScore: 85, network: "Base" }),
      rules,
    );
    expect(result.violations.some((v) => v.ruleCategory === "liquidity")).toBe(true);
  });

  it("warns when liquidity risk is elevated", () => {
    const rules = defaultRules();
    const result = evaluateStrategy(
      baseContext({ liquidityRiskScore: 55, network: "Base" }),
      rules,
    );
    expect(result.warnings.some((w) => w.ruleCategory === "liquidity")).toBe(true);
  });

  it("does not trigger liquidity check when score is normal", () => {
    const rules = defaultRules();
    const result = evaluateStrategy(
      baseContext({ liquidityRiskScore: 30, network: "Base" }),
      rules,
    );
    expect(result.violations.some((v) => v.ruleCategory === "liquidity")).toBe(false);
    expect(result.warnings.some((w) => w.ruleCategory === "liquidity")).toBe(false);
  });
});
