import type { AutoModeContractVerification } from "@/server/autoMode/policy";

export type AutoModeActivationPrerequisites = {
  ready: boolean;
  durablePolicyStorage: boolean;
  sharedExecutionEnforcement: boolean;
  verifiedPolicyContract: boolean;
  signedPolicyAuthorization: boolean;
  blockers: string[];
};

function value(name: string) {
  return process.env[name]?.trim() ?? "";
}

/**
 * Issue #32 owns independent contract verification. Environment variables
 * are operator-provided configuration, not verification evidence, so this
 * adapter must never promote them to "verified" by itself.
 */
export function getAutoModeContractVerification(): AutoModeContractVerification {
  const expectedAddress = value("AUTO_MODE_CONTRACT_ADDRESS");
  const expectedNetwork = value("AUTO_MODE_CONTRACT_NETWORK");
  const expectedVersion = value("AUTO_MODE_CONTRACT_POLICY_VERSION");
  const observedAddress = value("AUTO_MODE_VERIFIED_CONTRACT_ADDRESS");
  const observedNetwork = value("AUTO_MODE_VERIFIED_CONTRACT_NETWORK");
  const observedVersion = value("AUTO_MODE_VERIFIED_CONTRACT_VERSION");
  const verifiedAt = value("AUTO_MODE_CONTRACT_VERIFIED_AT");
  if (value("AUTO_MODE_CONTRACT_VERIFICATION_STATUS") === "failed") {
    return {
      status: "failed",
      expectedAddress: expectedAddress || "Not configured",
      observedAddress: observedAddress || undefined,
      expectedNetwork: expectedNetwork || "Not configured",
      observedNetwork: observedNetwork || undefined,
      expectedVersion: expectedVersion || "Not configured",
      observedVersion: observedVersion || undefined,
      verifiedAt: verifiedAt || undefined,
      failureReason: value("AUTO_MODE_CONTRACT_VERIFICATION_FAILURE") || "Contract verifier reported failure.",
    };
  }

  return {
    status: "unverified",
    expectedAddress: expectedAddress || "Not configured",
    observedAddress: observedAddress || undefined,
    expectedNetwork: expectedNetwork || "Not configured",
    observedNetwork: observedNetwork || undefined,
    expectedVersion: expectedVersion || "Not configured",
    observedVersion: observedVersion || undefined,
    verifiedAt: verifiedAt || undefined,
    failureReason:
      "No independent V3 contract verification evidence is available. Auto mode remains off until dependencies #32 and #33 are complete.",
  };
}

/**
 * These capabilities are deliberately false until #6, #7, #32, and #33
 * provide their production adapters. Tests may inject a complete gate into
 * storage to exercise the future-ready policy engine, but configuration
 * alone cannot activate auto mode in a deployment.
 */
export function getAutoModeActivationPrerequisites(): AutoModeActivationPrerequisites {
  return {
    ready: false,
    durablePolicyStorage: false,
    sharedExecutionEnforcement: false,
    verifiedPolicyContract: false,
    signedPolicyAuthorization: false,
    blockers: [
      "dependency:#6:durable_policy_storage",
      "dependency:#7:shared_execution_enforcement",
      "dependency:#32:verified_policy_contract",
      "dependency:#33:signed_policy_authorization",
    ],
  };
}
