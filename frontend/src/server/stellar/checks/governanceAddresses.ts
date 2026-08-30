import "server-only";

import { stellarNetworks, getStellarRegistryContractId } from "@/lib/stellar/config";
import {
  getApprovedPubnetConfig,
  isContractId,
  type ApprovedPubnetConfig,
} from "@/server/stellar/config";
import { fail, pass, type PubnetCheckResult } from "@/server/stellar/checks/types";

const ID = "governance_addresses" as const;
const TITLE = "Governance-approved addresses";

/** Where the policy contract the app will consult is configured. */
export function getConfiguredPolicyContractId(): string | undefined {
  const value =
    process.env.STELLAR_PUBNET_POLICY_CONTRACT_ID ??
    process.env.NEXT_PUBLIC_STELLAR_PUBNET_POLICY_CONTRACT_ID;

  return value?.trim() || undefined;
}

/**
 * Verifies the registry and policy contracts are the governance-approved ones.
 *
 * This is deliberately separate from the on-chain identity check. That one asks
 * "is this contract the reviewed build"; this one asks "is this the contract we
 * agreed to consult at all". A perfectly reviewed contract at an unapproved
 * address still means the risk policy in force is not the one that was signed
 * off.
 */
export function checkGovernanceAddresses(
  approved: ApprovedPubnetConfig = getApprovedPubnetConfig(),
): PubnetCheckResult {
  if (!approved.registryContractId || !approved.policyContractId) {
    return fail(
      ID,
      TITLE,
      "approved_config_missing",
      "The approved pubnet registry or policy contract ID is not configured, so the " +
        "addresses in use cannot be compared against governance.",
    );
  }

  const configuredRegistry = getStellarRegistryContractId(stellarNetworks["stellar-pubnet"]);

  if (!isContractId(configuredRegistry) || configuredRegistry !== approved.registryContractId) {
    return fail(
      ID,
      TITLE,
      "registry_contract_unapproved",
      "The pubnet risk registry in use is not the governance-approved contract.",
      { configuredRegistry: configuredRegistry ?? "not configured" },
    );
  }

  const configuredPolicy = getConfiguredPolicyContractId();

  if (!isContractId(configuredPolicy) || configuredPolicy !== approved.policyContractId) {
    return fail(
      ID,
      TITLE,
      "policy_contract_unapproved",
      "The pubnet policy contract in use is not the governance-approved contract.",
      { configuredPolicy: configuredPolicy ?? "not configured" },
    );
  }

  return pass(
    ID,
    TITLE,
    "The pubnet registry and policy contracts are the governance-approved addresses.",
  );
}
