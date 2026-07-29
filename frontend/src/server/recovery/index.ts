import type { AgentResult, TransactionPreview, UserRule } from "@/server/types";
import {
  applyStaleIfExpired,
  expectedChainFamily,
  getIncidentMode,
  getPolicyVersion,
  getRecoveryConsequences,
} from "@/server/recovery/policy";
import * as store from "@/server/recovery/store";

export {
  applyStaleIfExpired,
  buildFreshness,
  computeFreshness,
  expectedChainFamily,
  getIncidentMode,
  getPolicyVersion,
  getRecoveryConsequences,
  setIncidentMode,
} from "@/server/recovery/policy";

export * from "@/server/recovery/store";

export type {
  RecoveryIncidentMode,
  RecoveryList,
  RecoveryNetworkFreshness,
  RecoveryRequest,
  RecoveryStateSummary,
  RecoveryStatus,
  RecoveryType,
} from "@/server/types";

/**
 * Map a recovery record to the contract authorization impact that the UI
 * should surface. The summary is appended into the transaction preview when
 * the user opens it from the recovery page.
 */
export function getRecoveryStateSummary(walletAddress?: string) {
  const records = store.listRecoveryRequests(walletAddress).map((record) => applyStaleIfExpired(record));
  const pausedAgents: AgentResult["agent"][] = [];
  const revokedAgents: AgentResult["agent"][] = [];
  const infiniteApprovalWarnings: Array<{ asset: string; consumer: string }> = [];
  const retainedIssuerControls: Array<{ asset: string; retention: string }> = [];
  const active = records.filter((record) => record.status !== "failed" && record.status !== "stale");

  for (const record of records) {
    if (record.status === "requested" || record.status === "prepared" || record.status === "submitted") {
      if (record.recoveryType === "pause_agent") {
        pausedAgents.push("execution", "decision");
      }
      if (record.recoveryType === "revoke_agent") {
        revokedAgents.push("execution", "decision");
      }
    }

    if ((record.recoveryType === "revoke_allowance" || record.recoveryType === "reduce_allowance") && record.asset && record.consumer) {
      infiniteApprovalWarnings.push({ asset: record.asset, consumer: record.consumer });
    }

    if (record.recoveryType === "remove_trustline" && record.asset) {
      const retention = record.consequences.find((text) => text.toLowerCase().includes("clawback")) ?? "Issuer retains control flags";
      retainedIssuerControls.push({ asset: record.asset, retention });
    }
  }

  return {
    pausedAgents: Array.from(new Set(pausedAgents)),
    revokedAgents: Array.from(new Set(revokedAgents)),
    infiniteApprovalWarnings,
    retainedIssuerControls,
    activeRecoveries: active.length,
    recent: records.slice(0, 6),
  };
}

/**
 * Update a TransactionPreview's policy + approval risk with recovery state.
 * Does not mutate the original preview; returns a new object for safe use.
 *
 * The function is intentionally additive so existing preview consumers
 * (TransactionPreview.tsx) keep working without changes.
 */
export function applyRecoveryToExecutionPreview(preview: TransactionPreview, options: { walletAddress?: string; rules?: UserRule } = {}) {
  const summary = getRecoveryStateSummary(options.walletAddress);
  const incident = getIncidentMode();

  const policy = {
    ...(preview.policy ?? {
      maxTradePercent: 0,
      maxRiskScore: 0,
      maxMemeExposurePercent: 0,
      autoExecute: false as const,
    }),
    policyVersion: getPolicyVersion(),
    recoveryState: {
      incidentMode: incident.enabled,
      activeRecoveries: summary.activeRecoveries,
      walletPaused: summary.pausedAgents.includes("execution"),
      walletRevoked: summary.revokedAgents.includes("execution"),
      infiniteApprovalWarnings: summary.infiniteApprovalWarnings,
      retainedIssuerControls: summary.retainedIssuerControls,
    },
  };

  const baseConsequences = preview.approvalRisk?.revokeSuggestion ? [preview.approvalRisk.revokeSuggestion] : [];
  const recoveryConsequences = preview.approvalRisk?.infiniteApprovalWarning
    ? [
        ...baseConsequences,
        `Recovery rules version ${getPolicyVersion()} is active.`,
      ]
    : baseConsequences;

  const approvalRisk = {
    ...(preview.approvalRisk ?? {
      infiniteApprovalWarning: false,
      existingAllowanceCheck: "not_required" as const,
      permitSupport: "planned" as const,
      permit2Support: "planned" as const,
    }),
    revivePlan: summary.infiniteApprovalWarnings.length > 0
      ? `Detected ${summary.infiniteApprovalWarnings.length} pending allowance recovery request(s).`
      : undefined,
    consequences: recoveryConsequences,
  };

  return {
    ...preview,
    policy,
    approvalRisk,
  };
}

/**
 * Helper used by /api/execute/prepare to refuse NEW preparation while
 * incident mode is active. Existing in-flight previews are returned untouched.
 */
export function assertPrepareAllowedByRecovery(): void {
  if (getIncidentMode().enabled) {
    throw new Error("Incident mode is enabled. New execution preparation is blocked.");
  }
}

/**
 * Convenience helper used by API routes to assert chain family and policy
 * before mutating the recovery store. Returns the resolved chain family.
 */
export function assertRecoveryChainFamily(recoveryType: import("@/server/types").RecoveryType, chainFamily: import("@/server/types").RecoveryChain | undefined) {
  const expected = expectedChainFamily(recoveryType);

  if (expected === "any") return expected;

  if (chainFamily !== expected) {
    throw new Error(`Recovery type ${recoveryType} requires chain family ${expected}, received ${chainFamily ?? "unknown"}.`);
  }

  return expected;
}

/**
 * Convenience helper: when /api/execute/confirm runs, create the matching
 * recovery record for EVM allowance revokes/removes so the UI has parity.
 * Not used for Stellar or for transactions that do not carry a recovery state.
 */
export function buildRecoveryRequestFromInput(input: {
  walletAddress: string;
  recoveryType: import("@/server/types").RecoveryType;
  asset?: string;
  consumer?: string;
  chainId?: string;
  chainFamily?: import("@/server/types").RecoveryChain;
  txHash?: string;
  status?: import("@/server/types").RecoveryStatus;
  consequences?: string[];
}) {
  return store.createRecoveryRequest({
    walletAddress: input.walletAddress,
    recoveryType: input.recoveryType,
    asset: input.asset,
    consumer: input.consumer,
    chainId: input.chainId,
    chainFamily: input.chainFamily,
    status: input.status ?? "submitted",
    incidentMode: false,
    consequences: input.consequences ?? getRecoveryConsequences({
      recoveryType: input.recoveryType,
      chainFamily: input.chainFamily ?? expectedChainFamily(input.recoveryType),
      asset: input.asset,
      consumer: input.consumer,
    }),
    txHash: input.txHash,
    preparedAt: new Date().toISOString(),
    submittedAt: new Date().toISOString(),
  });
}
