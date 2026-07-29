import assert from "node:assert/strict";
import {
  AUTO_MODE_POLICY_SCHEMA_VERSION,
  authorizationRequiresRenewal,
  detectPolicyExpansion,
  evaluateAutoModeBuyDecision,
  evaluateAutoModeReadiness,
  forceAutoModeOffForMigration,
  hashAutoModePolicy,
  hashAutoModeAuthorizationPayload,
  type AutoModeAuthorization,
  type AutoModeContractVerification,
  type AutoModePolicy,
} from "../src/server/autoMode/policy";
import {
  authorizeAutoMode,
  closeAutoModeAuthorization,
  getAutoModeSnapshot,
  resetAutoModeStorageForTests,
  saveAutoModePolicy,
} from "../src/server/autoMode/storage";
import {
  decodeWalletCookie,
  encodeWalletCookie,
} from "../src/server/security/walletSession";
import { getAutoModeContractVerification } from "../src/server/autoMode/runtime";
import { NextRequest } from "next/server";
import { POST as postAuthorization } from "../src/app/api/auto-mode/authorization/route";

const now = new Date("2026-07-29T12:00:00.000Z");
const walletCookie = encodeWalletCookie("0xAbC");
assert.equal(decodeWalletCookie(walletCookie), "0xabc");
assert.equal(
  decodeWalletCookie(`${walletCookie.slice(0, -1)}x`),
  undefined,
  "tampered wallet session cookies must be rejected",
);

process.env.AUTO_MODE_CONTRACT_VERIFICATION_STATUS = "verified";
process.env.AUTO_MODE_CONTRACT_ADDRESS = "0xcontract";
process.env.AUTO_MODE_VERIFIED_CONTRACT_ADDRESS = "0xcontract";
process.env.AUTO_MODE_CONTRACT_NETWORK = "base";
process.env.AUTO_MODE_VERIFIED_CONTRACT_NETWORK = "base";
process.env.AUTO_MODE_CONTRACT_POLICY_VERSION = "3.0.0";
process.env.AUTO_MODE_VERIFIED_CONTRACT_VERSION = "3.0.0";
process.env.AUTO_MODE_CONTRACT_VERIFICATION_ID = "operator_claim";
process.env.AUTO_MODE_CONTRACT_VERIFIED_AT = now.toISOString();
assert.equal(
  getAutoModeContractVerification().status,
  "unverified",
  "operator environment variables cannot self-verify the policy contract",
);
const policy: AutoModePolicy = {
  schemaVersion: AUTO_MODE_POLICY_SCHEMA_VERSION,
  policyVersion: 1,
  walletAddress: "0xAbC",
  maxDailyValueUsd: 500,
  maxRiskScore: 40,
  maxTradePercent: 10,
  maxSlippageBps: 75,
  maxPriceImpactBps: 100,
  allowedChains: ["Base", "GOAT Network"],
  allowedAssets: ["USDC", "WETH"],
  minStableReservePercent: 20,
  stopConditions: {
    stopLossPercent: 10,
    takeProfitPercent: 25,
    pauseOnCriticalRisk: true,
    pauseOnSourceCoverageLoss: true,
  },
};

const reorderedPolicy: AutoModePolicy = {
  ...policy,
  walletAddress: "0xabc",
  allowedChains: ["goat network", "base", "BASE"],
  allowedAssets: ["weth", "usdc"],
};
assert.equal(hashAutoModePolicy(policy), hashAutoModePolicy(reorderedPolicy), "canonical policy hashing must ignore roster order, case, and duplicates");

const verification: AutoModeContractVerification = {
  status: "verified",
  expectedAddress: "0xContract",
  observedAddress: "0xcontract",
  expectedNetwork: "Base",
  observedNetwork: "base",
  expectedVersion: "3.0.0",
  observedVersion: "3.0.0",
  verifiedAt: "2026-07-29T11:55:00.000Z",
};
const authorization: AutoModeAuthorization = {
  status: "authorized",
  walletAddress: "0xabc",
  policyVersion: policy.policyVersion,
  policyHash: hashAutoModePolicy(policy),
  contractAddress: "0xcontract",
  network: "base",
  contractVersion: "3.0.0",
  allowanceUsd: 500,
  expiresAt: "2026-07-30T12:00:00.000Z",
  authorizationProofId: "proof_test_1",
  signedPayloadHash: hashAutoModeAuthorizationPayload({
    walletAddress: "0xabc",
    policyHash: hashAutoModePolicy(policy),
    contractAddress: "0xcontract",
    network: "base",
    contractVersion: "3.0.0",
    allowanceUsd: 500,
    expiresAt: "2026-07-30T12:00:00.000Z",
  }),
  explanationAcknowledgedAt: "2026-07-29T11:58:00.000Z",
  walletAuthorizedAt: "2026-07-29T11:59:00.000Z",
};
const safeSignals = {
  assetKnown: true,
  criticalContractRisk: false,
  canSell: true,
  phishingDetected: false,
  identityConflict: false,
  hasSourceCoverage: true,
};
const safeBuyContext = {
  dailyValueAlreadyUsd: 0,
  tradeValueUsd: 50,
  portfolioValueUsd: 1_000,
  riskScore: 20,
  slippageBps: 50,
  priceImpactBps: 50,
  chain: "base",
  asset: "usdc",
  stableReservePercentAfter: 30,
  stopConditionTriggered: false,
  safetySignals: safeSignals,
};
const completeActivationPrerequisites = {
  ready: true,
  durablePolicyStorage: true,
  sharedExecutionEnforcement: true,
  verifiedPolicyContract: true,
  signedPolicyAuthorization: true,
  blockers: [],
};

assert.equal(evaluateAutoModeReadiness({ policy, contractVerification: verification, authorization, now }).enabled, true);
assert.deepEqual(
  evaluateAutoModeReadiness({
    policy,
    contractVerification: verification,
    authorization,
    operation: "buy",
    now,
  }).immutableBuyBlockers,
  ["unknown_asset", "no_source_coverage"],
  "buy evaluation must fail closed when transaction safety signals are absent",
);
assert.equal(evaluateAutoModeBuyDecision(policy, safeBuyContext).allowed, true);

const limitCases = [
  ["max_daily_value_exceeded", { dailyValueAlreadyUsd: 475 }],
  ["max_risk_exceeded", { riskScore: 41 }],
  ["max_trade_percent_exceeded", { tradeValueUsd: 101 }],
  ["max_slippage_exceeded", { slippageBps: 76 }],
  ["max_price_impact_exceeded", { priceImpactBps: 101 }],
  ["stable_reserve_below_minimum", { stableReservePercentAfter: 19 }],
  ["chain_not_allowed", { chain: "ethereum" }],
  ["asset_not_allowed", { asset: "unknown" }],
  ["stop_condition_triggered", { stopConditionTriggered: true }],
] as const;
for (const [expectedBlocker, override] of limitCases) {
  const decision = evaluateAutoModeBuyDecision(policy, {
    ...safeBuyContext,
    ...override,
  });
  assert.equal(decision.allowed, false);
  assert.ok(decision.blockers.includes(expectedBlocker));
}

const immutableCases = [
  ["unknown_asset", { assetKnown: false }],
  ["critical_contract_risk", { criticalContractRisk: true }],
  ["cannot_sell", { canSell: false }],
  ["phishing_or_identity_conflict", { phishingDetected: true }],
  ["phishing_or_identity_conflict", { identityConflict: true }],
  ["no_source_coverage", { hasSourceCoverage: false }],
] as const;
for (const [expectedBlocker, override] of immutableCases) {
  const decision = evaluateAutoModeBuyDecision(
    { ...policy, maxRiskScore: 100, maxTradePercent: 100 },
    {
      ...safeBuyContext,
      safetySignals: { ...safeSignals, ...override },
    },
  );
  assert.equal(decision.allowed, false);
  assert.ok(decision.immutableBuyBlockers.includes(expectedBlocker));
}

const incomplete = evaluateAutoModeReadiness({
  policy: { ...policy, allowedAssets: [] },
  contractVerification: verification,
  authorization,
  buySafetySignals: safeSignals,
  now,
});
assert.equal(incomplete.enabled, false);
assert.ok(incomplete.blockers.includes("missing_limit:allowedAssets"));

const unverified = evaluateAutoModeReadiness({
  policy,
  contractVerification: { ...verification, status: "unverified" },
  authorization,
  buySafetySignals: safeSignals,
  now,
});
assert.equal(unverified.enabled, false);
assert.ok(unverified.blockers.includes("contract_unverified"));

const allImmutable = evaluateAutoModeReadiness({
  policy: { ...policy, maxRiskScore: 100, maxTradePercent: 100 },
  contractVerification: verification,
  authorization: { ...authorization, policyHash: hashAutoModePolicy({ ...policy, maxRiskScore: 100, maxTradePercent: 100 }) },
  operation: "buy",
  buySafetySignals: {
    assetKnown: false,
    criticalContractRisk: true,
    canSell: false,
    phishingDetected: true,
    identityConflict: true,
    hasSourceCoverage: false,
  },
  now,
});
assert.equal(allImmutable.enabled, false);
assert.deepEqual(allImmutable.immutableBuyBlockers, [
  "unknown_asset",
  "critical_contract_risk",
  "cannot_sell",
  "phishing_or_identity_conflict",
  "no_source_coverage",
]);

for (const status of ["cancelled", "rejected", "expired"] as const) {
  const result = evaluateAutoModeReadiness({
    policy,
    contractVerification: verification,
    authorization: { ...authorization, status },
    buySafetySignals: safeSignals,
    now,
  });
  assert.equal(result.enabled, false, `${status} authorization must fail closed`);
  assert.ok(result.blockers.includes(`authorization_${status}`));
}

const expired = evaluateAutoModeReadiness({
  policy,
  contractVerification: verification,
  authorization: { ...authorization, expiresAt: now.toISOString() },
  buySafetySignals: safeSignals,
  now,
});
assert.equal(expired.enabled, false);
assert.ok(expired.blockers.includes("authorization_expired"));

const expandedPolicy: AutoModePolicy = {
  ...policy,
  policyVersion: 2,
  maxDailyValueUsd: 750,
  allowedAssets: [...policy.allowedAssets, "WBTC"],
};
const expansion = detectPolicyExpansion(policy, expandedPolicy);
assert.equal(expansion.expanded, true);
assert.deepEqual(expansion.reasons, ["max_daily_value_increased", "allowed_assets_expanded"]);
assert.equal(authorizationRequiresRenewal(policy, expandedPolicy, authorization, now).required, true);

const restrictedPolicy: AutoModePolicy = {
  ...policy,
  maxDailyValueUsd: 250,
  maxRiskScore: 30,
  allowedAssets: ["USDC"],
  minStableReservePercent: 30,
};
assert.equal(detectPolicyExpansion(policy, restrictedPolicy).expanded, false);

const migrated = forceAutoModeOffForMigration({ autoModeEnabled: true, walletAddress: "0xlegacy" });
assert.equal(migrated.autoModeEnabled, false);
assert.equal(migrated.autoModeAuthorizationStatus, "pending");
assert.equal(migrated.migrationRequiresAuthorization, true);

resetAutoModeStorageForTests();
assert.equal(getAutoModeSnapshot(policy.walletAddress, { now, contractVerification: verification }).effectiveEnabled, false, "new users must default off");

const initialSave = saveAutoModePolicy({
  walletAddress: policy.walletAddress,
  policy,
  requestedEnabled: true,
  explanationAccepted: true,
  expansionConfirmed: false,
});
assert.equal(initialSave.saved, true);
authorizeAutoMode({
  walletAddress: policy.walletAddress,
  confirmationPhrase: "AUTHORIZE AUTO MODE",
  allowanceUsd: policy.maxDailyValueUsd,
  expiresAt: authorization.expiresAt,
  authorizationProofId: authorization.authorizationProofId,
  signedPayloadHash: authorization.signedPayloadHash,
  contractVerification: verification,
  now,
});
assert.equal(
  getAutoModeSnapshot(policy.walletAddress, {
    now,
    contractVerification: verification,
    activationPrerequisites: completeActivationPrerequisites,
  }).effectiveEnabled,
  true,
  "complete policy plus verified contract and bound wallet authorization may enable",
);

const expansionAttempt = saveAutoModePolicy({
  walletAddress: policy.walletAddress,
  policy: expandedPolicy,
  requestedEnabled: true,
  explanationAccepted: true,
  expansionConfirmed: false,
});
assert.equal(expansionAttempt.saved, false, "policy expansion must require a second explicit confirmation");

const confirmedExpansion = saveAutoModePolicy({
  walletAddress: policy.walletAddress,
  policy: expandedPolicy,
  requestedEnabled: true,
  explanationAccepted: true,
  expansionConfirmed: true,
});
assert.equal(confirmedExpansion.saved, true);
const expandedSnapshot = getAutoModeSnapshot(policy.walletAddress, { now, contractVerification: verification });
assert.equal(expandedSnapshot.effectiveEnabled, false, "confirmed expansion must still invalidate the old wallet authorization");
assert.equal(expandedSnapshot.authorizationStatus, "pending");

closeAutoModeAuthorization(policy.walletAddress, "cancelled", now);

const blockedAuthorizationRequest = new NextRequest(
  "http://localhost/api/auto-mode/authorization",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `gr_wallet_session=${encodeWalletCookie(policy.walletAddress)}`,
    },
    body: JSON.stringify({
      action: "authorize",
      walletAddress: policy.walletAddress,
      confirmationPhrase: "AUTHORIZE AUTO MODE",
      allowanceUsd: policy.maxDailyValueUsd,
      expiresAt: authorization.expiresAt,
    }),
  },
);

void postAuthorization(
  blockedAuthorizationRequest,
).then((blockedAuthorizationResponse) => {
  assert.equal(
    blockedAuthorizationResponse.status,
    409,
    "the production endpoint must reject activation while dependencies are incomplete",
  );
  assert.equal(getAutoModeSnapshot(policy.walletAddress, { now, contractVerification: verification }).authorizationStatus, "cancelled");
  closeAutoModeAuthorization(policy.walletAddress, "rejected", now);
  assert.equal(getAutoModeSnapshot(policy.walletAddress, { now, contractVerification: verification }).authorizationStatus, "rejected");
  console.log("auto-mode fixture checks passed");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
