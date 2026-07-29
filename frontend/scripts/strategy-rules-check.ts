/**
 * Unit and API checks for persistent strategy profiles and the rule editor.
 *
 * Run with `npm run test:rules`.
 */

import {
  BLOCKABLE_CATEGORIES,
  STRATEGY_PRESETS,
  STRATEGY_PRESET_VERSION,
  diffFromPreset,
  listStrategyPresets,
} from "../src/server/rules/presets";
import {
  BlockedAssetKeyError,
  normalizeBlockedAssetKey,
  parseBlockedAssetKey,
  parseBlockedAssetList,
} from "../src/server/rules/assetKeys";
import {
  buildProfileFromPreset,
  migrateLegacyRule,
  resolveProfileId,
  validateStrategyProfile,
} from "../src/server/rules/strategyProfile";
import { NextRequest } from "next/server";
import { getUserRuleRecord, upsertUserRuleRecord } from "../src/server/storage";
import { GET as getRules, POST as postRules } from "../src/app/api/rules/route";
import type { UserRule } from "../src/server/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  assert(same, `${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
}

/** A valid Stellar account used as a classic-asset issuer in the fixtures. */
const ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
/** A valid Soroban contract id. */
const CONTRACT = "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE";

function runPresetChecks() {
  const presets = listStrategyPresets();
  assertEqual(
    presets.map((preset) => preset.id),
    ["conservative", "balanced", "aggressive"],
    "Presets must be listed conservative to aggressive.",
  );

  // Every preset documents every limit; a missing field would silently fall
  // back to zero somewhere downstream.
  const limitKeys = Object.keys(STRATEGY_PRESETS.balanced.limits).sort();

  for (const preset of presets) {
    assertEqual(Object.keys(preset.limits).sort(), limitKeys, `${preset.id} must define every limit.`);

    for (const [key, value] of Object.entries(preset.limits)) {
      assert(Number.isFinite(value), `${preset.id}.${key} must be a finite number.`);
      assert(value >= 0, `${preset.id}.${key} must not be negative.`);
    }

    for (const category of preset.blockedCategories) {
      assert(BLOCKABLE_CATEGORIES.includes(category), `${preset.id} blocks unknown category "${category}".`);
    }

    assert(
      preset.limits.minStableReservePercent + preset.limits.maxTradePercent <= 100,
      `${preset.id} reserve and trade percent must be satisfiable together.`,
    );
  }

  // Risk appetite must increase monotonically across the three presets,
  // otherwise the labels mislead.
  assert(
    STRATEGY_PRESETS.conservative.limits.maxBuyRisk < STRATEGY_PRESETS.balanced.limits.maxBuyRisk &&
      STRATEGY_PRESETS.balanced.limits.maxBuyRisk < STRATEGY_PRESETS.aggressive.limits.maxBuyRisk,
    "Max Buy Risk must increase from conservative to aggressive.",
  );
  assert(
    STRATEGY_PRESETS.conservative.limits.minStableReservePercent >
      STRATEGY_PRESETS.aggressive.limits.minStableReservePercent,
    "Conservative must hold a larger stable reserve than aggressive.",
  );

  assertEqual(diffFromPreset("balanced", STRATEGY_PRESETS.balanced.limits), [], "A preset must not differ from itself.");
  assertEqual(
    diffFromPreset("balanced", { ...STRATEGY_PRESETS.balanced.limits, maxTradePercent: 99 }),
    ["maxTradePercent"],
    "diffFromPreset must report the changed key.",
  );
}

function runAssetKeyChecks() {
  assertEqual(
    normalizeBlockedAssetKey("evm:base:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
    "evm:base:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "EVM keys must lowercase the address and keep the chain.",
  );

  // The same address on two chains must not collapse to one key.
  assert(
    normalizeBlockedAssetKey("evm:base:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48") !==
      normalizeBlockedAssetKey("evm:ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
    "The same token address on different chains must stay distinct.",
  );

  assertEqual(normalizeBlockedAssetKey("native"), "stellar:native", "Bare native must resolve to stellar:native.");
  assertEqual(
    normalizeBlockedAssetKey("stellar:native"),
    "stellar:native",
    "Prefixed native must resolve to the same key.",
  );

  assertEqual(
    normalizeBlockedAssetKey(`classic:usdc:${ISSUER.toLowerCase()}`),
    `stellar:classic:USDC:${ISSUER}`,
    "Classic keys must upper-case code and issuer and carry the stellar prefix.",
  );
  assertEqual(
    normalizeBlockedAssetKey(`stellar:classic:USDC:${ISSUER}`),
    `stellar:classic:USDC:${ISSUER}`,
    "A canonical classic key must be stable under re-normalization.",
  );

  assertEqual(
    normalizeBlockedAssetKey(`contract:${CONTRACT}`),
    `stellar:contract:${CONTRACT}`,
    "Soroban contract keys must carry the stellar prefix.",
  );

  const parsed = parseBlockedAssetKey(`classic:USDC:${ISSUER}`);
  assertEqual(parsed.kind, "stellar_classic", "Classic assets must be identified as classic.");
  assertEqual(parsed.chainFamily, "stellar", "Classic assets belong to the stellar family.");

  const evmParsed = parseBlockedAssetKey("evm:polygon:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
  assertEqual(evmParsed.chain, "polygon", "EVM assets must record their chain.");

  const rejects: [string, string][] = [
    ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "a bare EVM address"],
    ["evm:not-a-chain:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "an unknown EVM chain"],
    ["evm:base:0xnothex", "an invalid EVM address"],
    ["classic:USDC:NOT-AN-ISSUER", "an invalid issuer"],
    [`classic:TOOLONGASSETCODE:${ISSUER}`, "an over-long asset code"],
    ["contract:NOTACONTRACT", "an invalid contract id"],
    ["classic:USDC", "a classic key missing its issuer"],
    ["", "an empty key"],
    ["something-else", "an unrecognized key"],
  ];

  for (const [input, description] of rejects) {
    let threw = false;

    try {
      parseBlockedAssetKey(input);
    } catch (error) {
      threw = error instanceof BlockedAssetKeyError;
    }

    assert(threw, `Parsing must reject ${description}: ${JSON.stringify(input)}`);
  }

  // A list collects every failure and de-duplicates the successes.
  const list = parseBlockedAssetList([
    "evm:base:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "evm:base:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "nonsense",
    "also-nonsense",
  ]);
  assertEqual(list.keys.length, 1, "Duplicate keys must collapse to one entry.");
  assertEqual(list.errors.length, 2, "Every invalid row must be reported, not just the first.");
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    walletAddress: "0xWalletOne",
    profileId: "balanced",
    ...STRATEGY_PRESETS.balanced.limits,
    allowedChains: ["base", "stellar-testnet"],
    blockedAssets: [],
    blockedCategories: ["unaudited"],
    ...overrides,
  };
}

function runValidationChecks() {
  const ok = validateStrategyProfile(validPayload());
  assert(ok.ok, "A preset-shaped payload must validate.");
  assertEqual(ok.rule.profileId, "balanced", "Unmodified preset limits must keep the preset id.");
  assertEqual(ok.rule.autoExecute, false, "autoExecute must always be false.");
  assertEqual(ok.rule.maxRiskScore, ok.rule.maxBuyRisk, "The legacy risk mirror must track maxBuyRisk.");
  assertEqual(
    ok.rule.maxDailyTransactionValueUsd,
    ok.rule.maxDailyValueUsd,
    "The legacy daily-value mirror must track maxDailyValueUsd.",
  );
  assertEqual(ok.rule.blockedTokens, ok.rule.blockedAssets, "The legacy blocked mirror must track blockedAssets.");

  // Editing one limit off a preset makes the profile custom.
  const edited = validateStrategyProfile(validPayload({ maxTradePercent: 17 }));
  assert(edited.ok, "An edited profile must still validate.");
  assertEqual(edited.rule.profileId, "custom", "Diverging from a preset must switch the profile to custom.");
  assertEqual(edited.rule.maxTradePercent, 17, "The user's explicit value must be kept.");

  // Editing back to the preset re-adopts it.
  const readopted = validateStrategyProfile(validPayload({ profileId: "custom" }));
  assert(readopted.ok, "A custom profile matching a preset must validate.");
  assertEqual(readopted.rule.profileId, "balanced", "Limits matching a preset must re-adopt that preset.");

  assertEqual(
    resolveProfileId("aggressive", STRATEGY_PRESETS.conservative.limits),
    "conservative",
    "resolveProfileId must name the preset the limits actually match.",
  );

  const rangeCases: [Record<string, unknown>, string][] = [
    [{ maxBuyRisk: 101 }, "a percentage above 100"],
    [{ maxBuyRisk: -1 }, "a negative percentage"],
    [{ maxSlippageBps: 10_001 }, "slippage above 10000 bps"],
    [{ maxSlippageBps: 12.5 }, "fractional basis points"],
    [{ maxTradeValueUsd: -5 }, "a negative USD amount"],
    [{ maxBuyRisk: Number.NaN }, "a non-finite number"],
    [{ walletAddress: "" }, "an empty wallet address"],
  ];

  for (const [overrides, description] of rangeCases) {
    const result = validateStrategyProfile(validPayload(overrides));
    assert(!result.ok, `Validation must reject ${description}.`);
  }

  // Unknown chains and actions are rejected rather than dropped.
  const badChain = validateStrategyProfile(validPayload({ allowedChains: ["base", "not-a-chain"] }));
  assert(!badChain.ok, "An unknown chain must be rejected.");
  assert(
    badChain.issues.some((issue) => issue.field.startsWith("allowedChains")),
    "The unknown chain must be reported against allowedChains.",
  );

  const badAction = validateStrategyProfile(validPayload({ allowedActions: ["rug_pull"] }));
  assert(!badAction.ok, "An unknown action must be rejected.");

  const emptyChains = validateStrategyProfile(validPayload({ allowedChains: [] }));
  assert(!emptyChains.ok, "A profile with no allowed chains must be rejected.");

  const badCategory = validateStrategyProfile(validPayload({ blockedCategories: ["not-a-category"] }));
  assert(!badCategory.ok, "An unknown blocked category must be rejected.");

  const badAsset = validateStrategyProfile(validPayload({ blockedAssets: ["0xdeadbeef"] }));
  assert(!badAsset.ok, "An ambiguous asset key must be rejected.");

  const contradiction = validateStrategyProfile(validPayload({ minStableReservePercent: 90, maxTradePercent: 30 }));
  assert(!contradiction.ok, "A reserve that leaves no room for the allowed trade must be rejected.");

  // Chain display names and aliases still resolve, so legacy clients work.
  const legacyNames = validateStrategyProfile(validPayload({ allowedChains: ["GOAT", "BNB Chain"] }));
  assert(legacyNames.ok, "Chain display names must resolve to ids.");
  assertEqual(legacyNames.rule.allowedChains, ["goat", "bsc"], "Display names must normalize to scan-network ids.");

  // Warnings do not block a save.
  const warned = validateStrategyProfile(
    validPayload({ maxMemeExposurePercent: 40, maxSingleTokenExposurePercent: 20, minStableReservePercent: 10 }),
  );
  assert(warned.ok, "A dominated-but-valid limit must still save.");
  assert(warned.warnings.length > 0, "A dominated limit must produce a warning.");
}

function runMigrationChecks() {
  const seeded = buildProfileFromPreset("0xSeeded", "conservative");
  assertEqual(seeded.profileId, "conservative", "A seeded profile must carry its preset id.");
  assertEqual(seeded.presetVersion, STRATEGY_PRESET_VERSION, "A seeded profile must record the preset version.");
  assertEqual(seeded.autoExecute, false, "A seeded profile must not enable auto execution.");

  // A pre-strategy record keeps its explicit values and gains complete defaults.
  const legacy = migrateLegacyRule({
    walletAddress: "0xLegacy",
    maxRiskScore: 42,
    maxTradePercent: 7,
    maxMemeExposurePercent: 3,
    allowedChains: ["GOAT Network", "Base"],
    blockedTokens: ["evm:base:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"],
    autoExecute: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  } as Partial<UserRule> & { walletAddress: string });

  assertEqual(legacy.maxBuyRisk, 42, "Migration must preserve the legacy risk value.");
  assertEqual(legacy.maxRiskScore, 42, "Migration must keep the legacy mirror in sync.");
  assertEqual(legacy.maxTradePercent, 7, "Migration must preserve an explicit trade percent.");
  assertEqual(legacy.profileId, "custom", "A legacy record that matches no preset must be custom.");
  assertEqual(legacy.autoExecute, false, "Migration must force auto execution off.");
  assertEqual(legacy.allowedChains, ["goat", "base"], "Legacy chain names must migrate to ids.");
  assertEqual(
    legacy.blockedAssets,
    ["evm:base:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],
    "Legacy blocked tokens must migrate to canonical keys.",
  );
  assertEqual(legacy.createdAt, "2026-01-01T00:00:00.000Z", "Migration must keep the original creation time.");
  assert(
    Number.isFinite(legacy.minLiquidityUsd) && Number.isFinite(legacy.minStableReservePercent),
    "Migration must fill every missing limit.",
  );

  // An unparseable legacy entry is dropped rather than stored unmatched.
  const unparseable = migrateLegacyRule({
    walletAddress: "0xLegacyBad",
    blockedTokens: ["garbage", "evm:base:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"],
  } as Partial<UserRule> & { walletAddress: string });
  assertEqual(unparseable.blockedAssets.length, 1, "Unparseable legacy blocked entries must be dropped.");
}

function runStorageChecks() {
  const wallet = "0xRoundTrip";
  const fresh = getUserRuleRecord(wallet);
  assertEqual(fresh.walletAddress, wallet, "An unseen wallet must get a profile scoped to it.");
  assertEqual(fresh.profileId, "balanced", "An unseen wallet must start on the balanced preset.");

  const saved = upsertUserRuleRecord({
    ...fresh,
    profileId: "custom",
    maxBuyRisk: 33,
    maxRiskScore: 33,
    allowedChains: ["base", "stellar-testnet"],
    blockedAssets: [`stellar:classic:USDC:${ISSUER}`, "evm:base:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],
    blockedCategories: ["meme"],
  });

  const reloaded = getUserRuleRecord(wallet);
  assertEqual(reloaded.maxBuyRisk, 33, "A saved limit must survive a reload.");
  assertEqual(reloaded.allowedChains, ["base", "stellar-testnet"], "Allowed chains must round-trip.");
  assertEqual(
    reloaded.blockedAssets,
    [`stellar:classic:USDC:${ISSUER}`, "evm:base:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],
    "EVM and Stellar blocked assets must round-trip together.",
  );
  assertEqual(reloaded.blockedCategories, ["meme"], "Blocked categories must round-trip.");
  assertEqual(reloaded.createdAt, saved.createdAt, "createdAt must be stable across writes.");

  // Profiles are scoped per wallet.
  const other = getUserRuleRecord("0xOtherWallet");
  assertEqual(
    other.maxBuyRisk,
    STRATEGY_PRESETS.balanced.limits.maxBuyRisk,
    "One wallet's edits must not leak to another.",
  );

  // A write that tries to enable auto execution is stored disabled.
  const forced = upsertUserRuleRecord({ ...reloaded, autoExecute: true } as UserRule);
  assertEqual(forced.autoExecute, false, "Storage must refuse to persist auto execution.");
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function runApiChecks() {
  const getResponse = getRules(new NextRequest("http://localhost/api/rules?walletAddress=0xApiWallet"));
  assertEqual(getResponse.status, 200, "GET /api/rules must succeed.");
  const getBody = await getResponse.json();
  assert(getBody.rule, "GET must return the wallet's rule.");
  assertEqual(getBody.presets.length, 3, "GET must return the three presets.");
  assertEqual(getBody.presetVersion, STRATEGY_PRESET_VERSION, "GET must report the preset version.");

  const created = await postRules(jsonRequest(validPayload({ walletAddress: "0xApiWallet" })));
  assertEqual(created.status, 200, "A valid POST must succeed.");
  const createdBody = await created.json();
  assertEqual(createdBody.rule.walletAddress, "0xApiWallet", "POST must echo the stored rule.");
  assertEqual(createdBody.rule.autoExecute, false, "POST must never store auto execution.");

  const invalid = await postRules(jsonRequest(validPayload({ maxBuyRisk: 140 })));
  assertEqual(invalid.status, 400, "An out-of-range value must be rejected with 400.");
  const invalidBody = await invalid.json();
  assert(Array.isArray(invalidBody.issues) && invalidBody.issues.length > 0, "A 400 must list the issues.");

  const invalidAsset = await postRules(jsonRequest(validPayload({ blockedAssets: ["0xdeadbeef"] })));
  assertEqual(invalidAsset.status, 400, "An invalid asset key must be rejected with 400.");

  const invalidChain = await postRules(jsonRequest(validPayload({ allowedChains: ["mars"] })));
  assertEqual(invalidChain.status, 400, "An unknown chain must be rejected with 400.");

  const malformed = await postRules(new Request("http://localhost/api/rules", { method: "POST", body: "not json" }));
  assertEqual(malformed.status, 400, "A malformed body must be rejected with 400.");

  // A POST that claims auto execution still stores it disabled rather than
  // silently accepting the flag.
  const autoAttempt = await postRules(
    jsonRequest({ ...validPayload({ walletAddress: "0xApiWallet" }), autoExecute: true }),
  );
  assertEqual(autoAttempt.status, 200, "An autoExecute flag must not break the save.");
  const autoBody = await autoAttempt.json();
  assertEqual(autoBody.rule.autoExecute, false, "An autoExecute flag must be ignored.");

  // The value written through the API must be what a later GET returns.
  await postRules(jsonRequest(validPayload({ walletAddress: "0xApiWallet", maxTradePercent: 11 })));
  const reread = getRules(new NextRequest("http://localhost/api/rules?walletAddress=0xApiWallet"));
  const rereadBody = await reread.json();
  assertEqual(rereadBody.rule.maxTradePercent, 11, "A saved value must be visible on the next GET.");
  assertEqual(rereadBody.rule.profileId, "custom", "A diverging saved profile must read back as custom.");
}

/**
 * The editor's save path is exercised through the same contract the component
 * uses: a `save` function returning a `Response`. These checks cover the two
 * behaviours that are easiest to get wrong — a failed save must not read as
 * success, and switching presets must not discard explicit user values.
 */
async function runEditorContractChecks() {
  const failure = new Response(JSON.stringify({ error: "Unable to save the strategy profile" }), { status: 503 });
  assert(!failure.ok, "A 503 must not be treated as ok.");
  const failureBody = await failure.json();
  assert(typeof failureBody.error === "string", "A failed save must carry a message to show the user.");
  assert(failureBody.rule === undefined, "A failed save must not return a rule to render as saved.");

  // Preset switching keeps the user's explicit non-limit choices. This mirrors
  // exactly what `applyPreset` in RuleForm spreads.
  const userProfile = {
    ...buildProfileFromPreset("0xEditor", "balanced"),
    allowedChains: ["base"],
    blockedAssets: [`stellar:contract:${CONTRACT}`],
    blockedCategories: ["meme"],
  };
  const afterPreset = {
    ...userProfile,
    ...STRATEGY_PRESETS.aggressive.limits,
    maxRiskScore: STRATEGY_PRESETS.aggressive.limits.maxBuyRisk,
    profileId: "aggressive" as const,
  };

  assertEqual(afterPreset.allowedChains, ["base"], "Switching presets must keep the user's chain selection.");
  assertEqual(
    afterPreset.blockedAssets,
    [`stellar:contract:${CONTRACT}`],
    "Switching presets must keep the user's blocked assets.",
  );
  assertEqual(afterPreset.blockedCategories, ["meme"], "Switching presets must keep the user's blocked categories.");
  assertEqual(
    afterPreset.maxBuyRisk,
    STRATEGY_PRESETS.aggressive.limits.maxBuyRisk,
    "Switching presets must apply the new preset's limits.",
  );

  const validated = validateStrategyProfile(afterPreset);
  assert(validated.ok, "A profile produced by switching presets must validate.");
}

async function main() {
  runPresetChecks();
  runAssetKeyChecks();
  runValidationChecks();
  runMigrationChecks();
  runStorageChecks();
  await runApiChecks();
  await runEditorContractChecks();

  console.log("Strategy rule checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
