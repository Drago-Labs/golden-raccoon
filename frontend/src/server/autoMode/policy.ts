import { createHash } from "node:crypto";

export const AUTO_MODE_POLICY_SCHEMA_VERSION = 1;

export type AutoModeStopConditions = {
  stopLossPercent: number;
  takeProfitPercent: number;
  pauseOnCriticalRisk: boolean;
  pauseOnSourceCoverageLoss: boolean;
};

export type AutoModePolicy = {
  schemaVersion: typeof AUTO_MODE_POLICY_SCHEMA_VERSION;
  policyVersion: number;
  walletAddress: string;
  maxDailyValueUsd: number;
  maxRiskScore: number;
  maxTradePercent: number;
  maxSlippageBps: number;
  maxPriceImpactBps: number;
  allowedChains: string[];
  allowedAssets: string[];
  minStableReservePercent: number;
  stopConditions: AutoModeStopConditions;
};

export type AutoModeContractVerification = {
  status: "unverified" | "verified" | "failed";
  expectedAddress: string;
  observedAddress?: string;
  expectedNetwork: string;
  observedNetwork?: string;
  expectedVersion: string;
  observedVersion?: string;
  verifiedAt?: string;
  failureReason?: string;
};

export type AutoModeAuthorizationStatus =
  | "pending"
  | "authorized"
  | "cancelled"
  | "rejected"
  | "expired";

export type AutoModeAuthorization = {
  status: AutoModeAuthorizationStatus;
  walletAddress: string;
  policyVersion: number;
  policyHash: string;
  contractAddress: string;
  network: string;
  contractVersion: string;
  allowanceUsd: number;
  expiresAt: string;
  authorizationProofId: string;
  signedPayloadHash: string;
  explanationAcknowledgedAt?: string;
  walletAuthorizedAt?: string;
  cancelledAt?: string;
  rejectedAt?: string;
};

export type ImmutableBuyBlockerCode =
  | "unknown_asset"
  | "critical_contract_risk"
  | "cannot_sell"
  | "phishing_or_identity_conflict"
  | "no_source_coverage";

export type ImmutableBuySafetySignals = {
  assetKnown: boolean;
  criticalContractRisk: boolean;
  canSell: boolean;
  phishingDetected: boolean;
  identityConflict: boolean;
  hasSourceCoverage: boolean;
};

export type AutoModeBuyContext = {
  dailyValueAlreadyUsd: number;
  tradeValueUsd: number;
  portfolioValueUsd: number;
  riskScore: number;
  slippageBps: number;
  priceImpactBps: number;
  chain: string;
  asset: string;
  stableReservePercentAfter: number;
  stopConditionTriggered: boolean;
  safetySignals?: ImmutableBuySafetySignals;
};

export type AutoModeBuyDecision = {
  allowed: boolean;
  blockers: string[];
  immutableBuyBlockers: ImmutableBuyBlockerCode[];
};

export type AutoModeReadinessInput = {
  policy?: Partial<AutoModePolicy>;
  contractVerification?: AutoModeContractVerification;
  authorization?: AutoModeAuthorization;
  operation?: "onboarding" | "buy";
  buySafetySignals?: ImmutableBuySafetySignals;
  now?: Date;
};

export type AutoModeReadiness = {
  enabled: boolean;
  policyHash?: string;
  blockers: string[];
  immutableBuyBlockers: ImmutableBuyBlockerCode[];
};

export type PolicyExpansion = {
  expanded: boolean;
  reasons: string[];
};

export type MigratedAutoModeState<T extends Record<string, unknown>> = T & {
  autoModeEnabled: false;
  autoModeAuthorizationStatus: "pending";
  migrationRequiresAuthorization: true;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeIdentity(value: string) {
  return value.trim().toLowerCase();
}

function normalizeRoster(values: string[]) {
  return [...new Set(values.map(normalizeIdentity).filter(Boolean))].sort();
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }

  return value;
}

export function canonicalAutoModePolicy(policy: AutoModePolicy) {
  return canonicalize({
    ...policy,
    walletAddress: normalizeIdentity(policy.walletAddress),
    allowedChains: normalizeRoster(policy.allowedChains),
    allowedAssets: normalizeRoster(policy.allowedAssets),
  });
}

export function hashAutoModePolicy(policy: AutoModePolicy) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalAutoModePolicy(policy)))
    .digest("hex");
}

export function hashAutoModeAuthorizationPayload(input: {
  walletAddress: string;
  policyHash: string;
  contractAddress: string;
  network: string;
  contractVersion: string;
  allowanceUsd: number;
  expiresAt: string;
}) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize({
      ...input,
      walletAddress: normalizeIdentity(input.walletAddress),
      contractAddress: normalizeIdentity(input.contractAddress),
      network: normalizeIdentity(input.network),
    })))
    .digest("hex");
}

export function getMissingAutoModeLimits(policy?: Partial<AutoModePolicy>): string[] {
  if (!policy) return ["policy"];

  const missing: string[] = [];
  if (policy.schemaVersion !== AUTO_MODE_POLICY_SCHEMA_VERSION) missing.push("schemaVersion");
  if (!Number.isInteger(policy.policyVersion) || (policy.policyVersion ?? 0) < 1) missing.push("policyVersion");
  if (!policy.walletAddress?.trim()) missing.push("walletAddress");
  if (!isFiniteNumber(policy.maxDailyValueUsd) || policy.maxDailyValueUsd <= 0) missing.push("maxDailyValueUsd");
  if (!isFiniteNumber(policy.maxRiskScore) || policy.maxRiskScore < 0 || policy.maxRiskScore > 100) missing.push("maxRiskScore");
  if (!isFiniteNumber(policy.maxTradePercent) || policy.maxTradePercent <= 0 || policy.maxTradePercent > 100) missing.push("maxTradePercent");
  if (!isFiniteNumber(policy.maxSlippageBps) || policy.maxSlippageBps < 0 || policy.maxSlippageBps > 10_000) missing.push("maxSlippageBps");
  if (!isFiniteNumber(policy.maxPriceImpactBps) || policy.maxPriceImpactBps < 0 || policy.maxPriceImpactBps > 10_000) missing.push("maxPriceImpactBps");
  if (!policy.allowedChains?.length || normalizeRoster(policy.allowedChains).length === 0) missing.push("allowedChains");
  if (!policy.allowedAssets?.length || normalizeRoster(policy.allowedAssets).length === 0) missing.push("allowedAssets");
  if (!isFiniteNumber(policy.minStableReservePercent) || policy.minStableReservePercent <= 0 || policy.minStableReservePercent > 100) {
    missing.push("minStableReservePercent");
  }

  const stops = policy.stopConditions;
  if (!stops) {
    missing.push("stopConditions");
  } else {
    if (!isFiniteNumber(stops.stopLossPercent) || stops.stopLossPercent <= 0 || stops.stopLossPercent > 100) {
      missing.push("stopConditions.stopLossPercent");
    }
    if (!isFiniteNumber(stops.takeProfitPercent) || stops.takeProfitPercent <= 0) {
      missing.push("stopConditions.takeProfitPercent");
    }
    if (stops.pauseOnCriticalRisk !== true) missing.push("stopConditions.pauseOnCriticalRisk");
    if (stops.pauseOnSourceCoverageLoss !== true) missing.push("stopConditions.pauseOnSourceCoverageLoss");
  }

  return missing;
}

export function evaluateImmutableBuyBlockers(signals?: ImmutableBuySafetySignals): ImmutableBuyBlockerCode[] {
  if (!signals) return ["unknown_asset", "no_source_coverage"];

  const blockers: ImmutableBuyBlockerCode[] = [];
  if (!signals.assetKnown) blockers.push("unknown_asset");
  if (signals.criticalContractRisk) blockers.push("critical_contract_risk");
  if (!signals.canSell) blockers.push("cannot_sell");
  if (signals.phishingDetected || signals.identityConflict) blockers.push("phishing_or_identity_conflict");
  if (!signals.hasSourceCoverage) blockers.push("no_source_coverage");
  return blockers;
}

export function evaluateAutoModeBuyDecision(
  policy: AutoModePolicy,
  context: AutoModeBuyContext,
): AutoModeBuyDecision {
  const immutableBuyBlockers = evaluateImmutableBuyBlockers(context.safetySignals);
  const blockers = immutableBuyBlockers.map(
    (blocker) => `immutable_buy_blocker:${blocker}`,
  );
  const numericFacts = [
    context.dailyValueAlreadyUsd,
    context.tradeValueUsd,
    context.portfolioValueUsd,
    context.riskScore,
    context.slippageBps,
    context.priceImpactBps,
    context.stableReservePercentAfter,
  ];

  if (numericFacts.some((fact) => !Number.isFinite(fact) || fact < 0)) {
    blockers.push("transaction_facts_missing_or_invalid");
  } else {
    if (
      context.dailyValueAlreadyUsd + context.tradeValueUsd >
      policy.maxDailyValueUsd
    ) blockers.push("max_daily_value_exceeded");
    if (context.riskScore > policy.maxRiskScore) blockers.push("max_risk_exceeded");
    if (
      context.portfolioValueUsd <= 0 ||
      (context.tradeValueUsd / context.portfolioValueUsd) * 100 >
        policy.maxTradePercent
    ) blockers.push("max_trade_percent_exceeded");
    if (context.slippageBps > policy.maxSlippageBps) blockers.push("max_slippage_exceeded");
    if (context.priceImpactBps > policy.maxPriceImpactBps) blockers.push("max_price_impact_exceeded");
    if (context.stableReservePercentAfter < policy.minStableReservePercent) {
      blockers.push("stable_reserve_below_minimum");
    }
  }

  if (!normalizeRoster(policy.allowedChains).includes(normalizeIdentity(context.chain))) {
    blockers.push("chain_not_allowed");
  }
  if (!normalizeRoster(policy.allowedAssets).includes(normalizeIdentity(context.asset))) {
    blockers.push("asset_not_allowed");
  }
  if (context.stopConditionTriggered) blockers.push("stop_condition_triggered");

  return {
    allowed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    immutableBuyBlockers,
  };
}

function contractVerificationBlockers(verification?: AutoModeContractVerification): string[] {
  if (!verification) return ["contract_verification_missing"];
  if (verification.status !== "verified") return [`contract_${verification.status}`];

  const blockers: string[] = [];
  if (!verification.expectedAddress.trim() || !verification.observedAddress?.trim()) blockers.push("contract_address_missing");
  if (!verification.expectedNetwork.trim() || !verification.observedNetwork?.trim()) blockers.push("contract_network_missing");
  if (!verification.expectedVersion.trim() || !verification.observedVersion?.trim()) blockers.push("contract_version_missing");
  if (!verification.verifiedAt || !Number.isFinite(Date.parse(verification.verifiedAt))) blockers.push("contract_verification_timestamp_missing");
  if (normalizeIdentity(verification.expectedAddress) !== normalizeIdentity(verification.observedAddress ?? "")) blockers.push("contract_address_mismatch");
  if (normalizeIdentity(verification.expectedNetwork) !== normalizeIdentity(verification.observedNetwork ?? "")) blockers.push("contract_network_mismatch");
  if (verification.expectedVersion.trim() !== verification.observedVersion?.trim()) blockers.push("contract_version_mismatch");
  return blockers;
}

function authorizationBlockers(
  policy: AutoModePolicy,
  policyHash: string,
  verification: AutoModeContractVerification,
  authorization: AutoModeAuthorization | undefined,
  now: Date,
): string[] {
  if (!authorization) return ["authorization_missing"];

  const blockers: string[] = [];
  if (authorization.status !== "authorized") blockers.push(`authorization_${authorization.status}`);
  if (normalizeIdentity(authorization.walletAddress) !== normalizeIdentity(policy.walletAddress)) blockers.push("authorization_wallet_mismatch");
  if (authorization.policyVersion !== policy.policyVersion) blockers.push("authorization_policy_version_mismatch");
  if (authorization.policyHash !== policyHash) blockers.push("authorization_policy_hash_mismatch");
  if (normalizeIdentity(authorization.contractAddress) !== normalizeIdentity(verification.expectedAddress)) blockers.push("authorization_contract_mismatch");
  if (normalizeIdentity(authorization.network) !== normalizeIdentity(verification.expectedNetwork)) blockers.push("authorization_network_mismatch");
  if (authorization.contractVersion.trim() !== verification.expectedVersion.trim()) blockers.push("authorization_contract_version_mismatch");
  if (!isFiniteNumber(authorization.allowanceUsd) || authorization.allowanceUsd <= 0) blockers.push("authorization_allowance_missing");
  if (!authorization.explanationAcknowledgedAt || !Number.isFinite(Date.parse(authorization.explanationAcknowledgedAt))) {
    blockers.push("explanation_acknowledgement_missing");
  }
  if (!authorization.walletAuthorizedAt || !Number.isFinite(Date.parse(authorization.walletAuthorizedAt))) {
    blockers.push("wallet_authorization_missing");
  }
  if (!authorization.authorizationProofId.trim()) blockers.push("authorization_proof_missing");
  const expectedSignedPayloadHash = hashAutoModeAuthorizationPayload({
    walletAddress: authorization.walletAddress,
    policyHash: authorization.policyHash,
    contractAddress: authorization.contractAddress,
    network: authorization.network,
    contractVersion: authorization.contractVersion,
    allowanceUsd: authorization.allowanceUsd,
    expiresAt: authorization.expiresAt,
  });
  if (authorization.signedPayloadHash !== expectedSignedPayloadHash) {
    blockers.push("authorization_signed_payload_mismatch");
  }

  const expiry = Date.parse(authorization.expiresAt);
  if (!Number.isFinite(expiry)) blockers.push("authorization_expiration_missing");
  else if (expiry <= now.getTime()) blockers.push("authorization_expired");
  return blockers;
}

export function evaluateAutoModeReadiness(input: AutoModeReadinessInput): AutoModeReadiness {
  const missingLimits = getMissingAutoModeLimits(input.policy);
  const immutableBuyBlockers =
    input.operation === "buy"
      ? evaluateImmutableBuyBlockers(input.buySafetySignals)
      : [];
  const blockers = [
    ...missingLimits.map((field) => `missing_limit:${field}`),
    ...contractVerificationBlockers(input.contractVerification),
    ...immutableBuyBlockers.map((blocker) => `immutable_buy_blocker:${blocker}`),
  ];

  let policyHash: string | undefined;
  if (missingLimits.length === 0) {
    const policy = input.policy as AutoModePolicy;
    policyHash = hashAutoModePolicy(policy);
    if (input.contractVerification) {
      blockers.push(
        ...authorizationBlockers(
          policy,
          policyHash,
          input.contractVerification,
          input.authorization,
          input.now ?? new Date(),
        ),
      );
    } else if (!blockers.includes("authorization_missing")) {
      blockers.push("authorization_missing");
    }
  }

  return {
    enabled: blockers.length === 0,
    policyHash,
    blockers: [...new Set(blockers)],
    immutableBuyBlockers,
  };
}

function additions(previous: string[], next: string[]) {
  const previousSet = new Set(normalizeRoster(previous));
  return normalizeRoster(next).filter((value) => !previousSet.has(value));
}

export function detectPolicyExpansion(previous: AutoModePolicy, next: AutoModePolicy): PolicyExpansion {
  const reasons: string[] = [];
  if (next.maxDailyValueUsd > previous.maxDailyValueUsd) reasons.push("max_daily_value_increased");
  if (next.maxRiskScore > previous.maxRiskScore) reasons.push("max_risk_increased");
  if (next.maxTradePercent > previous.maxTradePercent) reasons.push("max_trade_percent_increased");
  if (next.maxSlippageBps > previous.maxSlippageBps) reasons.push("max_slippage_increased");
  if (next.maxPriceImpactBps > previous.maxPriceImpactBps) reasons.push("max_price_impact_increased");
  if (next.minStableReservePercent < previous.minStableReservePercent) reasons.push("stable_reserve_reduced");
  if (additions(previous.allowedChains, next.allowedChains).length > 0) reasons.push("allowed_chains_expanded");
  if (additions(previous.allowedAssets, next.allowedAssets).length > 0) reasons.push("allowed_assets_expanded");
  if (next.stopConditions.stopLossPercent > previous.stopConditions.stopLossPercent) reasons.push("stop_loss_loosened");
  if (next.stopConditions.takeProfitPercent > previous.stopConditions.takeProfitPercent) reasons.push("take_profit_delayed");
  if (previous.stopConditions.pauseOnCriticalRisk && !next.stopConditions.pauseOnCriticalRisk) reasons.push("critical_risk_pause_disabled");
  if (previous.stopConditions.pauseOnSourceCoverageLoss && !next.stopConditions.pauseOnSourceCoverageLoss) reasons.push("source_coverage_pause_disabled");

  return { expanded: reasons.length > 0, reasons };
}

export function authorizationRequiresRenewal(
  previous: AutoModePolicy,
  next: AutoModePolicy,
  authorization?: AutoModeAuthorization,
  now = new Date(),
) {
  const expansion = detectPolicyExpansion(previous, next);
  const expiry = authorization ? Date.parse(authorization.expiresAt) : Number.NaN;
  const authorizationInvalid =
    !authorization ||
    authorization.status !== "authorized" ||
    !Number.isFinite(expiry) ||
    expiry <= now.getTime() ||
    authorization.policyHash !== hashAutoModePolicy(next) ||
    authorization.policyVersion !== next.policyVersion;

  return {
    required: expansion.expanded || authorizationInvalid,
    expansion,
  };
}

export function forceAutoModeOffForMigration<T extends Record<string, unknown>>(legacy: T): MigratedAutoModeState<T> {
  return {
    ...legacy,
    autoModeEnabled: false,
    autoModeAuthorizationStatus: "pending",
    migrationRequiresAuthorization: true,
  };
}
