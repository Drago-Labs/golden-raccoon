/**
 * Turning observations into a classification, and nothing more.
 *
 * Every branch below maps a *set of observations* to a label plus the sentence
 * that justifies it. Where the observations do not support a label, the answer
 * is `unsupported_proxy_pattern` or `unavailable` — deliberately unhelpful
 * labels, because a confident wrong answer is worse here than an admission.
 */
import { findSlot, holdsAddress } from "./standardSlots";
import type {
  AuthorityEvidence,
  CodeObservation,
  ImplementationHop,
  InspectionCoverage,
  ProxyClassification,
  ProxyFinding,
  SlotObservation,
} from "./schema";

export type ClassificationInput = {
  targetCode: CodeObservation;
  slots: SlotObservation[];
  path: ImplementationHop[];
  authority: AuthorityEvidence[];
  cycleDetected: boolean;
  truncated: boolean;
  failedReadCount: number;
};

/** True when both a direct implementation and a beacon are set on one address. */
export function hasConflictingSlots(slots: SlotObservation[]): boolean {
  const direct = findSlot(slots, "erc1967Implementation");
  const beacon = findSlot(slots, "erc1967Beacon");

  return Boolean(direct && beacon && holdsAddress(direct) && holdsAddress(beacon));
}

export function classify(input: ClassificationInput): { classification: ProxyClassification; summary: string } {
  const { targetCode, slots, path, cycleDetected } = input;

  if (targetCode.unavailableReason) {
    return {
      classification: "unavailable",
      summary: `The code at the target could not be read (${targetCode.unavailableReason}), so nothing is claimed about proxy indirection.`,
    };
  }

  if (!targetCode.hasCode) {
    return {
      classification: "not_a_contract",
      summary: "The address held no code at the checked block, so it is an externally owned account and has no implementation to inspect.",
    };
  }

  if (cycleDetected) {
    return {
      classification: "cyclic_indirection",
      summary: "The implementation chain returns to an address it already visited. The walk stopped there; no single implementation is named.",
    };
  }

  if (hasConflictingSlots(slots)) {
    return {
      classification: "conflicting_slots",
      summary:
        "Both the ERC-1967 implementation slot and the beacon slot hold addresses. The standard does not define which applies, so both are shown and neither is presented as the implementation.",
    };
  }

  const firstHop = path[0];

  if (!firstHop) {
    const unreadable = slots.filter((slot) => slot.unavailableReason).length;

    if (unreadable === slots.length) {
      return {
        classification: "unavailable",
        summary: "No standardized slot could be read, so whether this contract delegates is unknown.",
      };
    }

    const dirty = slots.filter((slot) => slot.isDirty).length;

    return {
      classification: dirty > 0 ? "unsupported_proxy_pattern" : "no_proxy_indirection_observed",
      summary:
        dirty > 0
          ? "A standardized slot held a value that is not an address. That is consistent with a proxy pattern this inspector does not support, so no implementation is named."
          : "No standardized proxy slot held an address at the checked block. The contract may still be upgradeable through a pattern this inspector does not read.",
    };
  }

  if (firstHop.kind === "unresolved") {
    return {
      classification: "unsupported_proxy_pattern",
      summary: "A beacon address was found, but it did not answer implementation(). The current implementation is therefore unknown, not absent.",
    };
  }

  if (firstHop.kind === "beacon") {
    return {
      classification: "erc1967_beacon_proxy",
      summary: "The contract reads its implementation from an ERC-1967 beacon, so the implementation can change for every proxy that follows that beacon.",
    };
  }

  if (firstHop.kind === "legacy_slot") {
    return {
      classification: "legacy_slot_proxy",
      summary: "The implementation address was found in the legacy OpenZeppelin slot rather than the ERC-1967 slot.",
    };
  }

  return {
    classification: "erc1967_direct_proxy",
    summary: "The contract holds an implementation address in the ERC-1967 slot and delegates to it.",
  };
}

export function buildFindings(input: ClassificationInput, classification: ProxyClassification): ProxyFinding[] {
  const findings: ProxyFinding[] = [];
  const { slots, path, authority, truncated, failedReadCount } = input;

  if (classification === "conflicting_slots") {
    const direct = findSlot(slots, "erc1967Implementation");
    const beacon = findSlot(slots, "erc1967Beacon");

    findings.push({
      findingId: "conflicting-indirection-slots",
      severity: "attention",
      statement: "Two standardized slots disagree about where the implementation comes from.",
      evidence: `Implementation slot held ${direct?.rawValue ?? "no value"}; beacon slot held ${beacon?.rawValue ?? "no value"}.`,
      limitation: "Which one the proxy actually uses depends on its code, which was not read.",
    });
  }

  if (input.cycleDetected) {
    findings.push({
      findingId: "cyclic-indirection",
      severity: "attention",
      statement: "The implementation chain is cyclic.",
      evidence: path[path.length - 1]?.evidence ?? "A visited address reappeared in the chain.",
      limitation: "A cycle in storage does not prove the contract is unusable; it means the chain cannot be resolved to one implementation by reading slots.",
    });
  }

  if (truncated) {
    findings.push({
      findingId: "chain-truncated",
      severity: "informational",
      statement: "The implementation chain is longer than the published depth bound and was not followed to its end.",
      evidence: path[path.length - 1]?.evidence ?? "The depth bound was reached.",
      limitation: "The final implementation is not named because the walk stopped, not because it does not exist.",
    });
  }

  const zeroImplementation = findSlot(slots, "erc1967Implementation");

  if (zeroImplementation && zeroImplementation.isZero) {
    findings.push({
      findingId: "implementation-slot-zero",
      severity: "informational",
      statement: "The ERC-1967 implementation slot is present but holds the zero address.",
      evidence: `${zeroImplementation.label} (${zeroImplementation.slot}) held ${zeroImplementation.rawValue}.`,
      limitation:
        "A zero implementation slot is not an immutability claim. It is consistent with a contract that is not a proxy, and with a proxy that has not been initialized.",
    });
  }

  if (authority.every((entry) => entry.kind === "not_observed")) {
    findings.push({
      findingId: "authority-not-observed",
      severity: "informational",
      statement: "No upgrade authority was observed.",
      evidence: authority.map((entry) => entry.evidence).join(" "),
      limitation:
        "This is the strongest statement the observations support. It is not a finding that the contract is immutable, and it must not be read as one.",
    });
  }

  const unreadable = slots.filter((slot) => slot.unavailableReason);

  if (unreadable.length > 0) {
    findings.push({
      findingId: "partial-slot-coverage",
      severity: "informational",
      statement: `${unreadable.length} of ${slots.length} standardized slots could not be read.`,
      evidence: unreadable.map((slot) => `${slot.label}: ${slot.unavailableReason}`).join(" "),
      limitation: `The report is partial. ${failedReadCount} read(s) failed in total.`,
    });
  }

  return findings;
}

export function buildCoverage(input: ClassificationInput, rpcCallsUsed: number, rpcCallBudget: number): InspectionCoverage {
  const { targetCode, slots, failedReadCount } = input;

  if (targetCode.unavailableReason) {
    return {
      state: "unavailable",
      note: "The target code read failed, so no part of the inspection completed.",
      rpcCallsUsed,
      rpcCallBudget,
      failedReadCount,
    };
  }

  if (!targetCode.hasCode) {
    return {
      state: "empty",
      note: "The address holds no code, so there is nothing to inspect. This is a successful result, not a failure.",
      rpcCallsUsed,
      rpcCallBudget,
      failedReadCount,
    };
  }

  if (failedReadCount > 0 || slots.some((slot) => slot.unavailableReason)) {
    return {
      state: "partial",
      note: "Some reads did not complete. Conclusions are drawn only from the observations that did.",
      rpcCallsUsed,
      rpcCallBudget,
      failedReadCount,
    };
  }

  return {
    state: "complete",
    note: "Every planned read completed at the checked block.",
    rpcCallsUsed,
    rpcCallBudget,
    failedReadCount,
  };
}
