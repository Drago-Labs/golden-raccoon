import {
  CURRENT_RULE_SCHEMA_VERSION,
  SUPPORTED_RULE_SCHEMA_VERSIONS,
  type CurrentRule,
} from "../src/server/rules/schema";
import {
  STRATEGY_PRESETS,
  listStrategyPresets,
  type StrategyProfileId,
} from "../src/server/rules/presets";
import {
  migrateRule,
  safeMigrateToCurrent,
  RuleMigrationError,
} from "../src/server/rules/migrate";
import {
  validateRule,
  validateRulePayload,
  RuleValidationError,
} from "../src/server/rules/validate";
import {
  diffRules,
  formatRuleDiffSummary,
} from "../src/server/rules/diff";
import {
  previewRule,
  previewRuleEvaluation,
  type CandidateSignal,
} from "../src/server/rules/preview";
import {
  validLegacyV1Rules,
  validCurrentV2Rules,
  unparseableRuleFixtures,
} from "../src/server/rules/__fixtures__/legacy-rules";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runMigrationVerification(): void {
  for (const v1 of validLegacyV1Rules) {
    const migrated = migrateRule(v1);
    assert(migrated.schemaVersion === CURRENT_RULE_SCHEMA_VERSION, "Migrated rule must have current schema version");
    assert(migrated.walletAddress === v1.walletAddress, "Migrated rule must preserve wallet address");
    assert(migrated.autoExecute === false, "Migrated rule must enforce autoExecute false");

    const idempotent = migrateRule(migrated);
    assert(JSON.stringify(idempotent) === JSON.stringify(migrated), "Migration of migrated rule must be strictly idempotent");
  }

  for (const current of validCurrentV2Rules) {
    const res = migrateRule(current);
    assert(JSON.stringify(res) === JSON.stringify(current), "Migrating an already current rule must be a no-op");
  }

  for (const unparseable of unparseableRuleFixtures) {
    let threw = false;
    try {
      migrateRule(unparseable);
    } catch (err) {
      threw = true;
      assert(err instanceof RuleMigrationError, "Unparseable input must throw RuleMigrationError");
      assert(Array.isArray(err.issues) || err.code === "unsupported_schema_version", "Error must provide typed issues or error code");
    }
    assert(threw, "Unparseable input must throw error and never evaluate as partial object");
  }
}

function runValidationVerification(): void {
  for (const preset of listStrategyPresets()) {
    const candidate: CurrentRule = {
      schemaVersion: CURRENT_RULE_SCHEMA_VERSION,
      walletAddress: "0x1111111111111111111111111111111111111111",
      profileId: preset.id as StrategyProfileId,
      presetVersion: 1,
      ...preset.limits,
      allowedChains: ["base", "stellar-testnet"],
      blockedAssets: [],
      blockedCategories: [...preset.blockedCategories],
      allowedActions: [...preset.allowedActions],
      autoExecute: false,
    };
    const validation = validateRule(candidate);
    assert(validation.ok, `Preset ${preset.id} must pass validation: ${validation.error}`);
  }

  const invalidCandidate = {
    schemaVersion: CURRENT_RULE_SCHEMA_VERSION,
    walletAddress: "0x1111111111111111111111111111111111111111",
    profileId: "custom" as const,
    presetVersion: 1,
    maxBuyRisk: 150,
    maxTradePercent: 60,
    maxTradeValueUsd: 1000,
    maxDailyValueUsd: 5000,
    minLiquidityUsd: 100000,
    maxSingleTokenExposurePercent: 25,
    minStableReservePercent: 70,
    maxMemeExposurePercent: 5,
    maxSlippageBps: 100,
    allowedChains: ["unknown-chain-123"],
    blockedAssets: [],
    blockedCategories: [],
    allowedActions: [],
    autoExecute: true,
  };

  const formResult = validateRulePayload(invalidCandidate);
  assert(!formResult.ok, "Form validator must reject invalid candidate");

  const engineResult = validateRule(invalidCandidate);
  assert(!engineResult.ok, "Engine validator must reject invalid candidate");
  assert(formResult.issues.length > 0, "Form validation must output typed issues");
  assert(engineResult.issues.length > 0, "Engine validation must output typed issues");
}

function runDiffVerification(): void {
  const base = validCurrentV2Rules[0];
  const updated: CurrentRule = {
    ...base,
    maxBuyRisk: 25,
    allowedChains: ["base", "arbitrum"],
  };

  const diff = diffRules(base, updated);
  assert(diff.hasDifferences, "Diff must detect changes");
  assert(diff.scalarChanges.some((c) => c.field === "maxBuyRisk" && c.before === 40 && c.after === 25), "Diff must track scalar changes");
  assert(diff.arrayChanges.some((a) => a.field === "allowedChains" && a.added.includes("arbitrum")), "Diff must track array additions");

  const summary = formatRuleDiffSummary(diff);
  assert(summary.includes("Max Buy Risk"), "Diff summary must include readable field label");

  const identicalDiff = diffRules(base, base);
  assert(!identicalDiff.hasDifferences, "Identical rules must produce hasDifferences false");
}

function runPreviewVerification(): void {
  const rule = validCurrentV2Rules[0];
  const signals: CandidateSignal[] = [
    {
      id: "sig_eth",
      canonicalKey: "evm:base:0xeth",
      chainId: "base",
      symbol: "ETH",
      liquidityUsd: 200000,
      riskScore: 20,
      categories: ["defi"],
    },
    {
      id: "sig_meme",
      canonicalKey: "evm:base:0xmeme",
      chainId: "base",
      symbol: "PEPE",
      liquidityUsd: 100000,
      riskScore: 30,
      categories: ["meme"],
    },
    {
      id: "sig_sol",
      canonicalKey: "solana:mainnet:sol",
      chainId: "solana",
      symbol: "SOL",
      liquidityUsd: 500000,
      riskScore: 10,
      categories: ["layer1"],
    },
  ];

  const result = previewRuleEvaluation(rule, signals);
  assert(result.totalEvaluated === 3, "Preview must evaluate all signals");
  assert(result.matchedCount === 1, "Preview must match eligible signals");
  assert(result.rejectedCount === 2, "Preview must reject ineligible signals");
  assert(result.matched[0].symbol === "ETH", "ETH must match criteria");
  assert(result.rejected.some((r) => r.reason.includes("meme")), "PEPE must be blocked by category");
  assert(result.rejected.some((r) => r.reason.includes("Chain not allowed")), "SOL must be blocked by chain allowlist");

  const restrictiveRule: CurrentRule = {
    ...rule,
    allowedChains: ["nonexistent-chain"],
  };
  const zeroResult = previewRule(restrictiveRule, signals);
  assert(zeroResult.zeroMatches === true, "Zero matches must be reported when no signals qualify");
  assert(zeroResult.matchedCount === 0, "Matched count must be 0 for zero matches");
}

function main(): void {
  runMigrationVerification();
  runValidationVerification();
  runDiffVerification();
  runPreviewVerification();
  console.log("Rule migration, validation, preview, and diff check passed successfully.");
}

main();
